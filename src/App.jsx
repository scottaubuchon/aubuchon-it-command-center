﻿import { Fragment, useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Download, AlertTriangle, Clock,
  CheckCircle, XCircle, Pause, FlaskConical, BarChart3, Calendar, Edit3,
  Save, X, User, Server, Shield, Monitor, Headphones, Layers, Search,
  List, LayoutGrid, ArrowRight, GripVertical, Square, CheckSquare,
  FolderOpen, Filter, ChevronUp, Zap, MoveRight, LogOut, Users,
  Building2, History, FileText, Tag, Eye, Briefcase, Archive, Inbox,
  ListChecks, CircleDot, RotateCcw, ArrowUpDown,
  Home, CreditCard, TrendingUp, Database, Lock, ArrowLeft, Link2, FolderKanban,
  Settings, UserPlus, ToggleLeft, ToggleRight, Check
} from "lucide-react";
import { auth, signOut, db, storage } from "./firebase";
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query, orderBy, where, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* =====================================================================
   CONFIGURATION
   ===================================================================== */

const STATUS_OPTIONS = ["Not Started", "In Progress", "Testing in Lab", "Done", "On Hold", "Blocked", "Backlog"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const TIER_OPTIONS = ["Project", "Quick Win", "Ongoing Support"];
const TIER_CONFIG = {
  "project": { label: "Project", color: "bg-blue-50 text-blue-700", dot: "bg-blue-500", icon: FolderKanban, border: "border-blue-200" },
  "quickwin": { label: "Quick Win", color: "bg-amber-50 text-amber-700", dot: "bg-amber-500", icon: Zap, border: "border-amber-200" },
  "support": { label: "Ongoing Support", color: "bg-teal-50 text-teal-700", dot: "bg-teal-500", icon: Headphones, border: "border-teal-200" },
};
const TIER_VALUE_MAP = { "Project": "project", "Quick Win": "quickwin", "Ongoing Support": "support" };
const TIER_LABEL_MAP = { "project": "Project", "quickwin": "Quick Win", "support": "Ongoing Support" };
const OWNER_OPTIONS = ["Dave Faucher", "Craig Renaud", "Eric Handley", "Suzanne Fleury", "Unassigned"];

const STATUS_CONFIG = {
  "Not Started": { color: "bg-gray-100 text-gray-600", icon: Clock, dot: "bg-gray-400", ring: "ring-gray-200" },
  "In Progress": { color: "bg-blue-50 text-blue-700", icon: BarChart3, dot: "bg-blue-500", ring: "ring-blue-200" },
  "Testing in Lab": { color: "bg-purple-50 text-purple-700", icon: FlaskConical, dot: "bg-purple-500", ring: "ring-purple-200" },
  "Done": { color: "bg-emerald-50 text-emerald-700", icon: CheckCircle, dot: "bg-emerald-500", ring: "ring-emerald-200" },
  "On Hold": { color: "bg-amber-50 text-amber-700", icon: Pause, dot: "bg-amber-500", ring: "ring-amber-200" },
  "Blocked": { color: "bg-red-50 text-red-700", icon: XCircle, dot: "bg-red-500", ring: "ring-red-200" },
  "Backlog": { color: "bg-slate-50 text-slate-600", icon: ListChecks, dot: "bg-slate-400", ring: "ring-slate-200" },
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

const VOTING_SECTIONS = [
  { id: "pos", label: "POS & Store Technology", depts: ["POS & Store Technology"], icon: Monitor, gradient: "from-violet-600 to-purple-600", bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dotFill: "bg-violet-500", dotRing: "border-violet-300", dotHover: "hover:bg-violet-100" },
  { id: "systems", label: "Enterprise Systems", depts: ["Enterprise Systems"], icon: Server, gradient: "from-blue-600 to-indigo-600", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dotFill: "bg-blue-500", dotRing: "border-blue-300", dotHover: "hover:bg-blue-100" },
  { id: "cyber", label: "Infrastructure & Cyber Security", depts: ["Infrastructure & Cyber Security"], icon: Shield, gradient: "from-emerald-600 to-teal-600", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dotFill: "bg-emerald-500", dotRing: "border-emerald-300", dotHover: "hover:bg-emerald-100" },
];
const DOTS_PER_SECTION = 5;
const MAX_DOTS_PER_PROJECT = 2;

const VIEWS = [
  { id: "projects", label: "All Projects", icon: Briefcase },
  { id: "owner",    label: "By Owner",     icon: Users },
  { id: "dept",     label: "By Dept",      icon: Building2 },
  { id: "voting",   label: "Voting",       icon: CircleDot },
  { id: "inbox",    label: "Inbox",        icon: Inbox },
  { id: "trash",    label: "Trash",        icon: Trash2 },
  { id: "history",  label: "History",       icon: Archive },
  { id: "changelog", label: "Change Log",  icon: History },
];

/* =====================================================================
   INITIAL PROJECT DATA  (updated April 1 2026 from IT_Systems_Projects_2026.docx)
   ===================================================================== */

const initialProjects = [
  // Enterprise Systems — Active Projects
  { id: 40, departments: ["Enterprise Systems"], name: "Merchant 2025.3 Update", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "4/8/2026", roadblocks: "External teams not responding to feedback requests; caused deferral", milestones: "", nextSteps: "", notes: "Upgrade Mi9 Merchant/MMS to version 2025.3 on the live environment", completedDate: "", subtasks: [], tier: "project" },
  { id: 41, departments: ["Enterprise Systems"], name: "Customer History Lookup v2 (Pre-Acquisition POS)", owner: "Dave Faucher", status: "In Progress", priority: "Low", pct: 0, date: "4/10/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Extend customer history lookup to include data from pre-acquisition POS systems: EPICOR, Rock Solid, Spruce, and others", completedDate: "", subtasks: [], tier: "project" },
  { id: 42, departments: ["Enterprise Systems"], name: "SpacePlan v2.0 Store (Mobile First)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "4/9/2026", roadblocks: "UX feedback cycles may extend timeline", milestones: "Beta Release", nextSteps: "", notes: "Redevelop the store-facing SpacePlan tool with a mobile-first responsive UI", completedDate: "", subtasks: [], tier: "project" },
  { id: 43, departments: ["Enterprise Systems"], name: "EZ-Commerce Website Integrations", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "5/29/2026", roadblocks: "Team bandwidth and lack of vendor requirements could extend timeline", milestones: "", nextSteps: "", notes: "Integrate HardwareStore.com with loyalty reward APIs (Aubuchon & Ace), promotions, Mi9/EDI BOSS order processing, and Benjamin Moore Color Selector data structure", completedDate: "", subtasks: [], tier: "project" },
  { id: 44, departments: ["Enterprise Systems"], name: "Progress to Snowflake (AR & Mi9)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "4/23/2026", roadblocks: "IT and Accounting team bandwidth for due diligence prior to release", milestones: "", nextSteps: "", notes: "Centralize AR Processes from Store to Support Center; provide auditing for terminated staff from Mi9 Store environment", completedDate: "", subtasks: [], tier: "project" },
  { id: 45, departments: ["Enterprise Systems"], name: "Price Change Tracking & Forecasting", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "4/22/2026", roadblocks: "IT Team bandwidth", milestones: "", nextSteps: "", notes: "Centralized price change tracking feeds: bin ticket printing, EZ-Commerce, TCB APIs, YODA, and Promo Management. Enables consistent pricing across all channels.", completedDate: "", subtasks: [], tier: "project" },
  { id: 46, departments: ["Enterprise Systems"], name: "Cookie Cutter Store Network Initiative", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "6/1/2026", roadblocks: "IT Team bandwidth", milestones: "", nextSteps: "", notes: "Standardize and template store networks and intranet sites for new store acquisitions beyond Store #244", completedDate: "", subtasks: [], tier: "project" },
  { id: 47, departments: ["Enterprise Systems"], name: "Price Ticket Generation Automation", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "6/8/2026", roadblocks: "Depends on completion of Price Change Tracking & Forecasting project", milestones: "", nextSteps: "", notes: "Fully automate price ticket generation sent to stores. Includes review of removing Bar Tender application from the technology stack.", completedDate: "", subtasks: [], tier: "project" },
  // Enterprise Systems — Ongoing Support & Operations
  { id: 48, departments: ["Enterprise Systems"], name: "EDI Technical Support", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing operational support for EDI data exchange (OpenText / EricWare). Includes monitoring, troubleshooting, and documentation.", completedDate: "", subtasks: [], tier: "support" },
  { id: 49, departments: ["Enterprise Systems"], name: "Promotion Support", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Continuous support for promotion configuration, testing, and issue resolution within Mi9 Merchant, Ace, and the Marketing Dept.", completedDate: "", subtasks: [], tier: "support" },
  { id: 50, departments: ["Enterprise Systems"], name: "Mi9 Merchant Support", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Day-to-day support for Mi9 Merchant operations including upgrade coordination, break-fix, and vendor escalation.", completedDate: "", subtasks: [], tier: "support" },
  { id: 51, departments: ["Enterprise Systems"], name: "YODA Dashboard Development Support", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Continuous development and enhancement of Power BI dashboards sourced from Snowflake/YODA for store operations and management.", completedDate: "", subtasks: [], tier: "support" },
  { id: 52, departments: ["Enterprise Systems"], name: "Database Optimization, Movement & Troubleshooting", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing performance tuning, data migrations, and issue resolution across operational databases (MS SQL / MySQL / Snowflake)", completedDate: "", subtasks: [], tier: "support" },
  { id: 53, departments: ["Enterprise Systems"], name: "TorqueBot", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Proactive IT notification and process automation engine. Monitoring of systems and the trigger of alerts or automated responses.", completedDate: "", subtasks: [], tier: "support" },
  { id: 54, departments: ["Enterprise Systems"], name: "Toolbox Initiative", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Centralized, secure, role-based portal for internal tools and data collection forms.", completedDate: "", subtasks: [], tier: "support" },
  { id: 55, departments: ["Enterprise Systems"], name: "New Store / Acquisitions Support", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "End-to-end technical support for new stores and acquisitions: customer data loading, EPICOR Bridge integration, and full store setup in Mi9 ecosystem.", completedDate: "", subtasks: [], tier: "support" },
  { id: 56, departments: ["Enterprise Systems"], name: "Documenting EricWare", owner: "Dave Faucher", status: "In Progress", priority: "Low", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing documentation effort for EricWare systems, with emphasis on EDI processes.", completedDate: "", subtasks: [], tier: "support" },
  // Enterprise Systems — Backlog
  { id: 57, departments: ["Enterprise Systems"], name: "Unified Bin Ticket Printing", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Consolidate bin ticket printing across all systems into a single, consistent workflow leveraging the Price Change Tracking initiative.", completedDate: "", subtasks: [], tier: "project" },
  { id: 58, departments: ["Enterprise Systems"], name: "Customer History Lookup v3 (Mi9 Customer History)", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Extend lookup to include Mi9 native customer transaction history.", completedDate: "", subtasks: [], tier: "project" },
  { id: 59, departments: ["Enterprise Systems"], name: "Customer History Lookup v4 (Service History: EPICOR / Ideal)", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Add service history from EPICOR and Ideal systems to the customer history lookup.", completedDate: "", subtasks: [], tier: "project" },
  { id: 60, departments: ["Enterprise Systems"], name: "SPORT v2.0 (Mobile First)", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Redesign SPORT with a mobile-first interface.", completedDate: "", subtasks: [], tier: "project" },
  { id: 61, departments: ["Enterprise Systems"], name: "HubSpot Improved Integration & Transaction Data", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Enhance HubSpot integration to include richer transaction-level data from POS and e-commerce.", completedDate: "", subtasks: [], tier: "project" },
  { id: 62, departments: ["Enterprise Systems"], name: "Epsilon CRM Integration", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Replace SailThru with Epsilon as the marketing automation / email platform.", completedDate: "", subtasks: [], tier: "project" },
  { id: 63, departments: ["Enterprise Systems"], name: "Progress to Snowflake (Promotion & Price Change Auditing)", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Provide visibility to promotion setups and price changes across all stores on a daily basis.", completedDate: "", subtasks: [], tier: "project" },
  { id: 64, departments: ["Enterprise Systems"], name: "Snowflake Structural Development", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Operational database migration using dbt and Snowflake Intelligence. May be used with Customer History Lookup v3 or v4.", completedDate: "", subtasks: [], tier: "project" },
  { id: 65, departments: ["Enterprise Systems"], name: "Automated Testing (POS / Merchant / HS.com)", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Build an automated regression and integration test suite for WinPOS, Mi9 Merchant, and HardwareStore.com.", completedDate: "", subtasks: [], tier: "project" },
  { id: 66, departments: ["Enterprise Systems"], name: "Unified Store Hours Management", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Single source of truth for store hours propagated to SPORT, Merchant, HS.com, Google My Business, SOCi, AH.com, and Yelp.", completedDate: "", subtasks: [], tier: "project" },
  { id: 67, departments: ["Enterprise Systems"], name: "ITSM", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Implement a formal IT service management platform covering ticketing, assigned equipment inventory, and a self-service portal for staff.", completedDate: "", subtasks: [], tier: "project" },
  { id: 68, departments: ["Enterprise Systems"], name: "Invalid Bin Ticket ID & Reprinting via Elvis", owner: "Dave Faucher", status: "Not Started", priority: "Low", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Automate identification and reprinting of invalid bin tickets using the Elvis devices.", completedDate: "", subtasks: [], tier: "project" },
  // Enterprise Systems — Recently Completed
  { id: 69, departments: ["Enterprise Systems"], name: "FindMyElvis v1.0", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Elvis store device locator", completedDate: "2026", subtasks: [], tier: "project" },
  { id: 70, departments: ["Enterprise Systems"], name: "Google SSO Login For Intranet Sites", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Google Single Sign-On authentication for internal websites", completedDate: "2026", subtasks: [], tier: "project" },
  { id: 71, departments: ["Enterprise Systems"], name: "Customer History Lookup v1", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "EPICOR-only customer history lookup", completedDate: "2026", subtasks: [], tier: "project" },
  { id: 72, departments: ["Enterprise Systems"], name: "Ace Promo Reconciliation Dataset", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Data collection & processing for Ace promotion reconciliation information for Accounting", completedDate: "2026", subtasks: [], tier: "project" },
  { id: 73, departments: ["Enterprise Systems"], name: "TCB API Refactor", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Performance refactor of TCB APIs", completedDate: "2026", subtasks: [], tier: "project" },
  { id: 74, departments: ["Enterprise Systems"], name: "SpacePlan v2.0 Admin Console", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Console for managing Store Sequence configuration and Bulk Import process", completedDate: "2026", subtasks: [], tier: "project" },
  { id: 75, departments: ["Enterprise Systems"], name: "HubSpot Customer Integration v1", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Initial HubSpot customer sync", completedDate: "2026", subtasks: [], tier: "project" },
  { id: 76, departments: ["Enterprise Systems"], name: "Quick Out Website Inventory v1", owner: "Dave Faucher", status: "Done", priority: "Medium", pct: 100, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Website inventory updates for Quick Out", completedDate: "2026", subtasks: [], tier: "project" },

  // Infrastructure & Cyber Security (updated April 1 2026)
  { id: 80, departments: ["Infrastructure & Cyber Security"], name: "Windows 11 Upgrade", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "5/1/2026", roadblocks: "Changes to the image, updates to POS software; deliveries delayed or missing equipment", milestones: "20-30 stores in progress", nextSteps: "", notes: "On track now, targeting end of April / early May", completedDate: "", subtasks: [], tier: "project" },
  { id: 81, departments: ["Infrastructure & Cyber Security"], name: "Store Re-IP", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "4/30/2026", roadblocks: "Internal applications not working with SSO; unplanned network traffic dependent on red tunnels", milestones: "Completed DDNS setup", nextSteps: "Engage with Mi9 for whitelisting", notes: "Ready to engage with Mi9 for whitelisting", completedDate: "", subtasks: [], tier: "project" },
  { id: 82, departments: ["Infrastructure & Cyber Security"], name: "Store Wireless Updates", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "6/30/2026", roadblocks: "Locations needing new wiring fall outside current IW project scope; new agreement for smaller jobs in progress", milestones: "Identified 20+ stores needing replacement or additional APs", nextSteps: "Working with 3rd party (IW) to dispatch for one-off fixes", notes: "End of 2nd quarter target", completedDate: "", subtasks: [], tier: "project" },
  { id: 83, departments: ["Infrastructure & Cyber Security"], name: "Physical Server Decommissioning", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "New VMs missing something and we would need to bring back online the old servers", milestones: "GP2 and RemoteGP (legacy physical hardware) offline post service migrations -- now running in Azure", nextSteps: "", notes: "Ongoing decommissioning of old hardware", completedDate: "", subtasks: [], tier: "support" },
  { id: 84, departments: ["Infrastructure & Cyber Security"], name: "Windows PCs Patching & Security Updates", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "5/1/2026", roadblocks: "Current WSUS will no longer function post Re-IP project", milestones: "", nextSteps: "Pricing and testing Splashtop endpoint management solution for patching", notes: "Apr/May target", completedDate: "", subtasks: [], tier: "project" },
  { id: 85, departments: ["Infrastructure & Cyber Security"], name: "Security Policy Creation", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "6/30/2026", roadblocks: "Other priorities and internal information/decision points", milestones: "Created IRP along with sub-policies for communication plan, backup restoration, asset disposal, etc.", nextSteps: "Need adoption/acceptance framework", notes: "End of 2nd quarter (ongoing)", completedDate: "", subtasks: [], tier: "project" },
  { id: 86, departments: ["Infrastructure & Cyber Security"], name: "Laptop Refresh", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "6/30/2026", roadblocks: "Current hardware costs are skyrocketing, in many cases doubling or more", milestones: "About 50% of deployed laptops are 6+ years old", nextSteps: "Looking into phasing in replacements", notes: "End of 2nd quarter target", completedDate: "", subtasks: [], tier: "project" },
  { id: 87, departments: ["Infrastructure & Cyber Security"], name: "Office Wireless Upgrade", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "4/30/2026", roadblocks: "", milestones: "Purchased new APs for the support center with more capacity", nextSteps: "", notes: "Should improve performance when at high volume", completedDate: "", subtasks: [], tier: "project" },
  { id: 88, departments: ["Infrastructure & Cyber Security"], name: "Firewall Software Update (v21.5)", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New firewall software version with improved security offerings", completedDate: "", subtasks: [], tier: "project" },
  { id: 89, departments: ["Infrastructure & Cyber Security"], name: "Cybersecurity Renewal (KnowBe4)", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "4/30/2026", roadblocks: "Direct LMS integration may not be an option", milestones: "", nextSteps: "Looking into next tier offering for more options on user education and possible LMS integration", notes: "End of April target", completedDate: "", subtasks: [], tier: "project" },
  { id: 90, departments: ["Infrastructure & Cyber Security"], name: "ColoRX Update to Newest Version", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "More details needed on planned rollout", notes: "Evan leading this effort", completedDate: "", subtasks: [], tier: "project" },
  { id: 91, departments: ["Infrastructure & Cyber Security"], name: "Safety Culture App", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "5/1/2026", roadblocks: "", milestones: "", nextSteps: "Adding to Elvis; may need user logins; working with vendor", notes: "Apr/May target", completedDate: "", subtasks: [], tier: "project" },
  { id: 11, departments: ["Infrastructure & Cyber Security", "Store Expansion"], name: "Store Conversions / IT Alignment", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "Aggressive 6-week timelines; vendor scheduling issues with IW", milestones: "73-75 store projects completed successfully", nextSteps: "Low-voltage cabling SOP to Mark; pre-project meetings for next 3-4 projects; floor plan markups for APs and Cat5 drops", notes: "IT infrastructure for store conversions -- process significantly improved", completedDate: "", subtasks: [], tier: "project" },
  { id: 12, departments: ["Infrastructure & Cyber Security", "POS & Store Technology"], name: "Delivery Pilot (IT Component)", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "4/7/2026", roadblocks: "DMS vendor lacks bulk import; daily product data updates difficult", milestones: "Store 218 South Burlington -- 5,000 sq ft warehouse space secured", nextSteps: "Set up separate VLAN; order 2 PCs, 2 phones, label printers; WorkWave driver login setup", notes: "Soft launch early April -- starting with 6 stores, could scale to 50", completedDate: "", subtasks: [], tier: "project" },

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

function Dropdown({ value, options, onChange, renderOption, renderTrigger, onAddNew }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);
  const handleAdd = () => {
    const trimmed = newVal.trim();
    if (trimmed && !options.includes(trimmed)) {
      onAddNew(trimmed);
      onChange(trimmed);
    }
    setNewVal("");
    setAdding(false);
    setOpen(false);
  };
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="focus:outline-none">{renderTrigger(value)}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setAdding(false); setNewVal(""); }} />
          <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[150px]" style={{ left: 0 }}>
            {options.map((opt) => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 transition-colors">
                {renderOption(opt)}
              </button>
            ))}
            {onAddNew && !adding && (
              <button onClick={() => setAdding(true)} className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition-colors border-t border-gray-100">
                <Plus size={12} /> Add new...
              </button>
            )}
            {onAddNew && adding && (
              <div className="px-2 py-2 border-t border-gray-100 flex gap-1">
                <input ref={inputRef} value={newVal} onChange={e => setNewVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewVal(""); } }}
                  placeholder="Enter name..." className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500" />
                <button onClick={handleAdd} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">Add</button>
              </div>
            )}
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

function NewProjectModal({ onSave, onClose, ownerOptions, allDepartments }) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState("project");
  const [owner, setOwner] = useState("Unassigned");
  const [dept, setDept] = useState("Enterprise Systems");
  const [status, setStatus] = useState("Not Started");
  const [priority, setPriority] = useState("Medium");

  const handleSave = () => {
    const trimmed = name.trim() || "New Project";
    onSave({ name: trimmed, tier, owner, departments: [dept], status, priority });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-5 py-3.5">
          <h3 className="text-sm font-bold text-white">New Project</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Project Name</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter project name..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Type</label>
              <select value={TIER_LABEL_MAP[tier]} onChange={e => setTier(TIER_VALUE_MAP[e.target.value])} className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Owner</label>
              <select value={owner} onChange={e => setOwner(e.target.value)} className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Department</label>
              <select value={dept} onChange={e => setDept(e.target.value)} className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {allDepartments.map(d => <option key={d} value={d}>{DEPT_SHORT[d] || d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">Create Project</button>
        </div>
      </div>
    </div>
  );
}

function ReviewProjectsModal({ projects, onUpdate, onClose, allDepartments }) {
  const [deptFilter, setDeptFilter] = useState("All");
  const filtered = useMemo(() => deptFilter === "All" ? projects : projects.filter(p => (p.departments || []).includes(deptFilter)), [projects, deptFilter]);
  const [idx, setIdx] = useState(0);
  const [localStatus, setLocalStatus] = useState("");
  const [localPct, setLocalPct] = useState(0);
  const [localNotes, setLocalNotes] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [dirty, setDirty] = useState(false);
  const total = filtered.length;
  const p = filtered[idx];

  useEffect(() => {
    if (filtered[idx]) {
      setLocalStatus(filtered[idx].status || "");
      setLocalPct(filtered[idx].pct || 0);
      setLocalNotes(filtered[idx].notes || "");
      setNewUpdate("");
      setDirty(false);
    }
  }, [idx, filtered]);

  useEffect(() => { setIdx(0); }, [deptFilter]);

  const saveAndNext = () => {
    if (p) {
      if (dirty) {
        if (localStatus !== p.status) onUpdate(p.id, "status", localStatus);
        if (localPct !== p.pct) onUpdate(p.id, "pct", localPct);
        if (localNotes !== p.notes) onUpdate(p.id, "notes", localNotes);
      }
      if (newUpdate.trim()) {
        const entry = { date: new Date().toLocaleDateString("en-US"), notes: newUpdate.trim(), links: [], author: "Scott" };
        onUpdate(p.id, "updateLog", [...(p.updateLog || []), entry]);
      }
    }
    if (idx < total - 1) setIdx(idx + 1);
    else onClose();
  };

  const skip = () => {
    if (idx < total - 1) setIdx(idx + 1);
    else onClose();
  };

  const hasChanges = dirty || newUpdate.trim().length > 0;

  if (!p || total === 0) return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-8 text-center" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-gray-500">No projects match this filter.</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg">Close</button>
      </div>
    </div>
  );

  const tc = TIER_CONFIG[p.tier] || TIER_CONFIG["project"];
  const pc = PRIORITY_CONFIG[p.priority] || PRIORITY_CONFIG["Medium"];
  const pctColor = localPct >= 75 ? "bg-emerald-500" : localPct >= 40 ? "bg-blue-500" : localPct > 0 ? "bg-amber-500" : "bg-gray-300";
  const existingUpdates = p.updateLog || [];
  const lastUpdate = existingUpdates.length > 0 ? existingUpdates[existingUpdates.length - 1] : null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-5 py-3.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-white/80" />
            <h3 className="text-sm font-bold text-white">Review Projects</h3>
          </div>
          <div className="flex items-center gap-3">
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="bg-white/20 text-white text-[10px] font-medium rounded px-2 py-1 border border-white/30 focus:outline-none">
              <option value="All" className="text-gray-900">All Depts</option>
              {allDepartments.map(d => <option key={d} value={d} className="text-gray-900">{DEPT_SHORT[d] || d}</option>)}
            </select>
            <span className="text-xs text-white/70 font-medium">{idx + 1} of {total}</span>
          </div>
        </div>

        <div className="h-1 bg-gray-100 flex-shrink-0">
          <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${((idx + 1) / total) * 100}%` }} />
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="text-sm font-bold text-gray-900 leading-tight">{p.name}</h4>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full font-semibold ${tc.color} border ${tc.border}`}>{tc.label}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full font-semibold ${pc.color} border ${pc.border}`}>{p.priority}</span>
              </div>
            </div>
            <span className="text-[11px] text-gray-400 font-medium">{String(p.owner || "Unassigned")}</span>
          </div>

          {p.roadblocks && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-0.5"><AlertTriangle size={11} />Roadblock</div>
              <p className="text-xs text-red-700 leading-relaxed">{p.roadblocks}</p>
            </div>
          )}

          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</label>
                <select value={localStatus} onChange={e => { setLocalStatus(e.target.value); setDirty(true); }}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Progress</label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="100" step="5" value={localPct} onChange={e => { setLocalPct(parseInt(e.target.value)); setDirty(true); }}
                    className="flex-1 h-2 accent-indigo-600" />
                  <input type="number" min="0" max="100" value={localPct} onChange={e => { setLocalPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0))); setDirty(true); }}
                    className="w-12 text-center text-xs font-semibold border border-gray-200 rounded-md py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <span className="text-[10px] text-gray-400">%</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${pctColor}`} style={{ width: `${Math.max(localPct, 2)}%` }} />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</label>
              <textarea value={localNotes} onChange={e => { setLocalNotes(e.target.value); setDirty(true); }} rows={2}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                placeholder="Project notes..." />
            </div>
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <History size={10} /> Add Update
                  {existingUpdates.length > 0 && <span className="text-gray-300">({existingUpdates.length} existing)</span>}
                </label>
              </div>
              {lastUpdate && (
                <div className="bg-gray-50 rounded-md px-2.5 py-1.5 mb-2 border border-gray-100">
                  <span className="text-[9px] text-gray-400 font-medium">{lastUpdate.date}</span>
                  <p className="text-[11px] text-gray-600 leading-relaxed line-clamp-2">{lastUpdate.notes}</p>
                </div>
              )}
              <textarea value={newUpdate} onChange={e => setNewUpdate(e.target.value)} rows={2}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                placeholder="What's the latest on this project?" />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">Close</button>
          <div className="flex items-center gap-2">
            <button onClick={skip} className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Skip</button>
            <button onClick={saveAndNext}
              className={`px-3.5 py-1.5 text-xs font-medium text-white rounded-lg shadow-sm transition-colors ${hasChanges ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-900 hover:bg-gray-800"}`}>
              {hasChanges ? (idx < total - 1 ? "Save & Next" : "Save & Finish") : (idx < total - 1 ? "Next" : "Finish")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierBadge({ tier, onChange }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG["project"];
  const Icon = cfg.icon;
  return (
    <Dropdown value={TIER_LABEL_MAP[tier] || "Project"} options={TIER_OPTIONS} onChange={(label) => onChange(TIER_VALUE_MAP[label])}
      renderTrigger={(v) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full font-semibold ${cfg.color} border ${cfg.border} cursor-pointer hover:opacity-80 transition-all`}>
          <Icon size={9} />{v}<ChevronDown size={8} className="opacity-50" />
        </span>
      )}
      renderOption={(s) => {
        const c = TIER_CONFIG[TIER_VALUE_MAP[s]];
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

function OwnerBadge({ owner, onChange, size = "sm", ownerOptions, onAddOwner }) {
  const sizeClass = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  const initials = owner === "Unassigned" ? "?" : String(owner || "").split(" ").map(n => n[0]).join("");
  return (
    <Dropdown value={owner} options={ownerOptions || OWNER_OPTIONS} onChange={onChange} onAddNew={onAddOwner}
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
        const chipClass = cfg ? cfg.chip : "bg-gray-50 text-gray-700 border-gray-200";
        const short = DEPT_SHORT[d] || d;
        return (
          <span key={d} className={`inline-flex items-center gap-1 ${size === "xs" ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]"} rounded-full font-medium border ${chipClass}`}>
            {short}
          </span>
        );
      })}
    </div>
  );
}

function DeptMultiSelect({ selected, onChange, allDepartments, onAddDept }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newDept, setNewDept] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);
  const toggle = (dept) => {
    if (selected.includes(dept)) {
      if (selected.length > 1) onChange(selected.filter(d => d !== dept));
    } else {
      onChange([...selected, dept]);
    }
  };
  const handleAddDept = () => {
    const trimmed = newDept.trim();
    if (trimmed && !(allDepartments || DEPARTMENTS).includes(trimmed)) {
      if (onAddDept) onAddDept(trimmed);
      onChange([...selected, trimmed]);
    }
    setNewDept("");
    setAdding(false);
  };
  const deptList = allDepartments || DEPARTMENTS;
  const DEFAULT_DEPT_CFG = { icon: Building2, gradient: "from-gray-500 to-gray-600", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", light: "bg-gray-100", chip: "bg-gray-50 text-gray-700 border-gray-200" };
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-gray-400 hover:text-blue-500 transition-colors" title="Edit departments">
        <Tag size={12} /><ChevronDown size={9} className="opacity-50" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setAdding(false); setNewDept(""); }} />
          <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[220px] right-0">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Departments</div>
            {deptList.map(d => {
              const cfg = DEPT_CONFIG[d] || DEFAULT_DEPT_CFG;
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
            {onAddDept && !adding && (
              <button onClick={() => setAdding(true)} className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition-colors border-t border-gray-100">
                <Plus size={12} /> Add department...
              </button>
            )}
            {onAddDept && adding && (
              <div className="px-2 py-2 border-t border-gray-100 flex gap-1">
                <input ref={inputRef} value={newDept} onChange={e => setNewDept(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddDept(); if (e.key === "Escape") { setAdding(false); setNewDept(""); } }}
                  placeholder="Department name..." className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500" />
                <button onClick={handleAddDept} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">Add</button>
              </div>
            )}
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
   DATE PICKER (calendar dropdown with consistent MM/DD/YYYY format)
   ===================================================================== */

function parseToISO(dateStr) {
  if (!dateStr) return "";
  if (dateStr.toLowerCase() === "ongoing") return "";
  // Try MM/DD/YYYY or M/D/YYYY
  const parts = String(dateStr || "").split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const year = y.length === 2 ? "20" + y : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Try YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return "";
}

function formatFromISO(isoStr) {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-");
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function DatePicker({ value, onChange, placeholder = "Set date..." }) {
  const [open, setOpen] = useState(false);
  const isoVal = parseToISO(value);
  const displayVal = value === "Ongoing" ? "Ongoing" : (isoVal ? formatFromISO(isoVal) : "");

  return (
    <div className="relative inline-flex items-center gap-1 group">
      <button onClick={() => setOpen(!open)} className="text-left text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1">
        <Calendar size={10} className="text-gray-300 group-hover:text-gray-500" />
        <span className={displayVal ? "" : "text-gray-300 italic"}>{displayVal || placeholder}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-col gap-1.5">
          <input type="date" value={isoVal} onChange={(e) => { onChange(formatFromISO(e.target.value)); setOpen(false); }} className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200" autoFocus />
          <div className="flex gap-1">
            <button onClick={() => { onChange(""); setOpen(false); }} className="text-[10px] text-gray-400 hover:text-gray-600 px-1">Clear</button>
            <button onClick={() => setOpen(false)} className="text-[10px] text-gray-400 hover:text-gray-600 px-1">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   SORTABLE TABLE HEADER
   ===================================================================== */

function SortHeader({ label, field, sortField, sortDir, onSort, className = "" }) {
  const active = sortField === field;
  return (
    <th className={`py-2.5 px-2 text-left cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`} onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {active ? (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : <ArrowUpDown size={9} className="text-gray-300" />}
      </div>
    </th>
  );
}

const PRIORITY_ORDER = { "High": 0, "Medium": 1, "Low": 2, "": 3 };
const STATUS_ORDER = { "In Progress": 0, "Not Started": 1, "On Hold": 2, "Completed": 3, "Cancelled": 4, "": 5 };

function useSortableProjects(projects) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const onSort = useCallback((field) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }, [sortField]);

  const sorted = useMemo(() => {
    if (!sortField) return projects;
    return [...projects].sort((a, b) => {
      let av, bv;
      switch (sortField) {
        case "name": av = (a.name || "").toLowerCase(); bv = (b.name || "").toLowerCase(); break;
        case "status": av = STATUS_ORDER[a.status] ?? 5; bv = STATUS_ORDER[b.status] ?? 5; break;
        case "priority": av = PRIORITY_ORDER[a.priority] ?? 3; bv = PRIORITY_ORDER[b.priority] ?? 3; break;
        case "owner": av = (a.owner || "").toLowerCase(); bv = (b.owner || "").toLowerCase(); break;
        case "pct": av = a.pct ?? 0; bv = b.pct ?? 0; break;
        case "date": {
          const da = parseToISO(a.date); const db2 = parseToISO(b.date);
          av = da || "9999"; bv = db2 || "9999"; break;
        }
        case "departments": av = (a.departments || []).join(",").toLowerCase(); bv = (b.departments || []).join(",").toLowerCase(); break;
        default: av = a[sortField] ?? ""; bv = b[sortField] ?? ""; break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [projects, sortField, sortDir]);

  return { sorted, sortField, sortDir, onSort };
}

/* =====================================================================
   VOTING HOOK — Firestore doc: dashboards/project-votes
   ===================================================================== */

function useVoting(projects) {
  const [votesData, setVotesData] = useState(null);
  const [votingLoaded, setVotingLoaded] = useState(false);
  const userEmail = (auth.currentUser?.email || "").toLowerCase();

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "dashboards", "project-votes"));
        if (snap.exists()) { setVotesData(snap.data()); }
        else { setVotesData({ votes: {}, config: { nonVoteable: [], voterRights: {} } }); }
      } catch (err) {
        console.warn("Voting load failed:", err);
        setVotesData({ votes: {}, config: { nonVoteable: [], voterRights: {} } });
      }
      setVotingLoaded(true);
    })();
  }, []);

  const myVotes = useMemo(() => {
    if (!votesData) return { pos: {}, systems: {}, cyber: {} };
    return votesData.votes?.[userEmail] || { pos: {}, systems: {}, cyber: {} };
  }, [votesData, userEmail]);

  const allVotes = useMemo(() => votesData?.votes || {}, [votesData]);
  const votingConfig = useMemo(() => votesData?.config || { nonVoteable: [], voterRights: {} }, [votesData]);

  const canVoteIn = useCallback((sectionId) => {
    return (votingConfig.voterRights?.[userEmail] || []).includes(sectionId);
  }, [votingConfig, userEmail]);

  const dotsRemaining = useCallback((sectionId) => {
    return DOTS_PER_SECTION - Object.values(myVotes[sectionId] || {}).reduce((s, c) => s + c, 0);
  }, [myVotes]);

  const sectionDotsForProject = useCallback((sectionId, projectId) => {
    const pid = String(projectId || "");
    let total = 0;
    Object.values(allVotes).forEach(uv => { total += (uv[sectionId]?.[pid] || 0); });
    return total;
  }, [allVotes]);

  const totalDotsForProject = useCallback((projectId) => {
    const pid = String(projectId || "");
    let total = 0;
    Object.values(allVotes).forEach(uv => {
      VOTING_SECTIONS.forEach(({ id }) => { total += (uv[id]?.[pid] || 0); });
    });
    return total;
  }, [allVotes]);

  const saveVotes = useCallback(async (updated) => {
    setVotesData(updated);
    try { await setDoc(doc(db, "dashboards", "project-votes"), updated); } catch (err) { console.warn("Vote save failed:", err); }
  }, []);

  const addDot = useCallback(async (sectionId, projectId) => {
    if (!votesData || !canVoteIn(sectionId)) return false;
    const pid = String(projectId || "");
    const current = myVotes[sectionId]?.[pid] || 0;
    if (current >= MAX_DOTS_PER_PROJECT || dotsRemaining(sectionId) <= 0) return false;
    if ((votingConfig.nonVoteable || []).includes(projectId)) return false;
    const updated = JSON.parse(JSON.stringify(votesData));
    if (!updated.votes[userEmail]) updated.votes[userEmail] = { pos: {}, systems: {}, cyber: {} };
    if (!updated.votes[userEmail][sectionId]) updated.votes[userEmail][sectionId] = {};
    updated.votes[userEmail][sectionId][pid] = current + 1;
    await saveVotes(updated);
    return true;
  }, [votesData, userEmail, myVotes, canVoteIn, dotsRemaining, votingConfig, saveVotes]);

  const removeDot = useCallback(async (sectionId, projectId) => {
    if (!votesData) return false;
    const pid = String(projectId || "");
    const current = myVotes[sectionId]?.[pid] || 0;
    if (current <= 0) return false;
    const updated = JSON.parse(JSON.stringify(votesData));
    if (current - 1 === 0) { delete updated.votes[userEmail][sectionId][pid]; }
    else { updated.votes[userEmail][sectionId][pid] = current - 1; }
    await saveVotes(updated);
    return true;
  }, [votesData, userEmail, myVotes, saveVotes]);

  const setNonVoteable = useCallback(async (projectIds) => {
    if (!votesData) return;
    const updated = JSON.parse(JSON.stringify(votesData));
    updated.config.nonVoteable = projectIds;
    await saveVotes(updated);
  }, [votesData, saveVotes]);

  const setVoterRights = useCallback(async (email, sectionIds) => {
    if (!votesData) return;
    const updated = JSON.parse(JSON.stringify(votesData));
    if (!updated.config.voterRights) updated.config.voterRights = {};
    updated.config.voterRights[(email || "").toLowerCase()] = sectionIds;
    await saveVotes(updated);
  }, [votesData, saveVotes]);

  return { myVotes, allVotes, votingConfig, addDot, removeDot, dotsRemaining, setNonVoteable, setVoterRights, canVoteIn, totalDotsForProject, sectionDotsForProject, votingLoaded, userEmail };
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
   UPDATE LOG (per-project dated changelog with links)
   ===================================================================== */

function Linkify({ text }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline break-all">{part}</a>
      : part
  );
}

function UpdateLog({ updates = [], onAdd, onReplace }) {
  const [showForm, setShowForm] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newLink, setNewLink] = useState("");
  const [links, setLinks] = useState([]);
  const [editingLink, setEditingLink] = useState(null);
  const [editLinkValue, setEditLinkValue] = useState("");
  const [editingIdx, setEditingIdx] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [editLinks, setEditLinks] = useState([]);
  const [editNewLink, setEditNewLink] = useState("");
  const [editingEntryLink, setEditingEntryLink] = useState(null);
  const [editEntryLinkValue, setEditEntryLinkValue] = useState("");

  const addLink = () => {
    if (newLink.trim()) { setLinks([...links, newLink.trim()]); setNewLink(""); }
  };

  const submit = () => {
    if (newNote.trim() || links.length > 0) {
      onAdd({ date: new Date().toLocaleDateString("en-US"), notes: newNote.trim(), links, author: "Scott" });
      setNewNote(""); setLinks([]); setShowForm(false);
    }
  };

  const realIdx = (displayIdx) => updates.length - 1 - displayIdx;

  const startEdit = (displayIdx) => {
    const u = [...updates].reverse()[displayIdx];
    setEditingIdx(displayIdx);
    setEditNote(u.notes || "");
    setEditLinks([...(u.links || [])]);
    setEditNewLink("");
    setEditingEntryLink(null);
  };

  const saveEdit = (displayIdx) => {
    const ri = realIdx(displayIdx);
    const updated = [...updates];
    updated[ri] = { ...updated[ri], notes: editNote.trim(), links: editLinks };
    onReplace(updated);
    setEditingIdx(null);
  };

  const deleteEntry = (displayIdx) => {
    const ri = realIdx(displayIdx);
    const updated = updates.filter((_, idx) => idx !== ri);
    onReplace(updated);
    setEditingIdx(null);
  };

  return (
    <div className="pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
          <History size={10} /> Update Log
          {updates.length > 0 && <span className="text-gray-300">({updates.length})</span>}
        </label>
        <button onClick={() => { setShowForm(!showForm); setEditingIdx(null); }} className="text-[10px] text-blue-500 hover:text-blue-700 font-medium">
          {showForm ? "Cancel" : "+ Add Update"}
        </button>
      </div>

      {showForm && (
        <div className="bg-blue-50/50 rounded-lg p-3 mb-2 border border-blue-100 space-y-2">
          <textarea value={newNote} onChange={(e) => { setNewNote(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} placeholder="What's the update? (Enter for new line)" className="w-full text-xs p-2 border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-blue-300" rows={2} />
          <div className="flex items-center gap-1">
            <input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="Paste a link (URL)..." className="flex-1 text-xs p-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} />
            <button onClick={addLink} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1.5 rounded-md font-medium">Add Link</button>
          </div>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {links.map((l, i) => (
                editingLink === i ? (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-white border border-blue-300 rounded px-1 py-0.5 ring-1 ring-blue-200">
                    <Link2 size={8} className="flex-shrink-0 text-blue-500" />
                    <input value={editLinkValue} onChange={(e) => setEditLinkValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const updated = [...links]; updated[i] = editLinkValue.trim() || l; setLinks(updated); setEditingLink(null); } if (e.key === "Escape") setEditingLink(null); }} onBlur={() => { const updated = [...links]; updated[i] = editLinkValue.trim() || l; setLinks(updated); setEditingLink(null); }} autoFocus className="text-[10px] border-none outline-none bg-transparent w-48" />
                  </span>
                ) : (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-white border border-gray-200 rounded px-2 py-0.5 max-w-xs truncate cursor-pointer hover:border-blue-300 hover:bg-blue-50/30" onClick={() => { setEditingLink(i); setEditLinkValue(l); }}>
                    <Link2 size={8} className="flex-shrink-0" />{l.length > 40 ? l.slice(0, 40) + "..." : l}
                    <button onClick={(e) => { e.stopPropagation(); setLinks(links.filter((_, j) => j !== i)); }} className="text-gray-400 hover:text-red-500 flex-shrink-0 ml-0.5">&times;</button>
                  </span>
                )
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={submit} className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium">Save Update</button>
          </div>
        </div>
      )}

      {updates.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {[...updates].reverse().map((u, i) => (
            editingIdx === i ? (
              <div key={i} className="bg-blue-50/50 rounded-lg p-3 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-500">{u.date}{u.author ? ` -- ${u.author}` : ""}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => deleteEntry(i)} className="text-[10px] text-red-500 hover:text-red-700 font-medium">Delete</button>
                    <button onClick={() => setEditingIdx(null)} className="text-[10px] text-gray-400 hover:text-gray-600 font-medium">Cancel</button>
                  </div>
                </div>
                <textarea value={editNote} onChange={(e) => { setEditNote(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} className="w-full text-xs p-2 border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-blue-300" rows={2} />
                <div className="flex items-center gap-1">
                  <input value={editNewLink} onChange={(e) => setEditNewLink(e.target.value)} placeholder="Add a link..." className="flex-1 text-xs p-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (editNewLink.trim()) { setEditLinks([...editLinks, editNewLink.trim()]); setEditNewLink(""); } } }} />
                  <button onClick={() => { if (editNewLink.trim()) { setEditLinks([...editLinks, editNewLink.trim()]); setEditNewLink(""); } }} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1.5 rounded-md font-medium">Add Link</button>
                </div>
                {editLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editLinks.map((l, j) => (
                      editingEntryLink === j ? (
                        <span key={j} className="inline-flex items-center gap-1 text-[10px] bg-white border border-blue-300 rounded px-1 py-0.5 ring-1 ring-blue-200">
                          <Link2 size={8} className="flex-shrink-0 text-blue-500" />
                          <input value={editEntryLinkValue} onChange={(e) => setEditEntryLinkValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const upd = [...editLinks]; upd[j] = editEntryLinkValue.trim() || l; setEditLinks(upd); setEditingEntryLink(null); } if (e.key === "Escape") setEditingEntryLink(null); }} onBlur={() => { const upd = [...editLinks]; upd[j] = editEntryLinkValue.trim() || l; setEditLinks(upd); setEditingEntryLink(null); }} autoFocus className="text-[10px] border-none outline-none bg-transparent w-48" />
                        </span>
                      ) : (
                        <span key={j} className="inline-flex items-center gap-1 text-[10px] bg-white border border-gray-200 rounded px-2 py-0.5 max-w-xs truncate cursor-pointer hover:border-blue-300 hover:bg-blue-50/30" onClick={() => { setEditingEntryLink(j); setEditEntryLinkValue(l); }}>
                          <Link2 size={8} className="flex-shrink-0" />{l.length > 40 ? l.slice(0, 40) + "..." : l}
                          <button onClick={(e) => { e.stopPropagation(); setEditLinks(editLinks.filter((_, k) => k !== j)); }} className="text-gray-400 hover:text-red-500 flex-shrink-0 ml-0.5">&times;</button>
                        </span>
                      )
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={() => saveEdit(i)} className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium">Save Changes</button>
                </div>
              </div>
            ) : (
              <div key={i} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold text-gray-500">{u.date}</span>
                  {u.author && <span className="text-[10px] text-gray-400">-- {u.author}</span>}
                  <span className="flex-1" />
                  <button onClick={() => startEdit(i)} className="text-[10px] text-gray-400 hover:text-blue-600 p-0.5 rounded hover:bg-blue-50" title="Edit"><Edit3 size={10} /></button>
                  <button onClick={() => deleteEntry(i)} className="text-[10px] text-gray-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50" title="Delete"><Trash2 size={10} /></button>
                </div>
                {u.notes && <p className="text-xs text-gray-700 whitespace-pre-wrap"><Linkify text={u.notes} /></p>}
                {u.links && u.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {u.links.map((l, j) => (
                      <a key={j} href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        <Link2 size={8} />{l.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

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
            <DeptMultiSelect selected={project.departments} onChange={(d) => onUpdate(project.id, "departments", d)} allDepartments={allDepartments} onAddDept={onAddDept} />
            <button onClick={(e) => { e.stopPropagation(); onDelete(project.id); }} className="text-red-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50" title="Delete project"><Trash2 size={13} /></button>
          </div>
        </div>

        {/* Department chips */}
        <div className="mb-2.5">
          <DeptChips departments={project.departments} size="xs" />
        </div>

        {/* Tier selector */}
        <div className="mb-2">
          <TierBadge tier={project.tier} onChange={(v) => onUpdate(project.id, "tier", v)} />
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <StatusBadge status={project.status} onChange={(v) => onUpdate(project.id, "status", v)} size="xs" />
          <PriorityBadge priority={project.priority} onChange={(v) => onUpdate(project.id, "priority", v)} size="xs" />
          <OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} size="xs" ownerOptions={ownerOptions} onAddOwner={onAddOwner} />
          <DatePicker value={project.date} onChange={(v) => onUpdate(project.id, "date", v)} placeholder="Set date..." />
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
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Est. Completion</label>
              <DatePicker value={project.date} onChange={(v) => onUpdate(project.id, "date", v)} />
            </div>
            {[
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

            {/* Update Log */}
            <UpdateLog updates={project.updateLog || []} onAdd={(entry) => onUpdate(project.id, "updateLog", [...(project.updateLog || []), entry])} onReplace={(arr) => onUpdate(project.id, "updateLog", arr)} />
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   PROJECT TABLE ROW (list views)
   ===================================================================== */

function ProjectRow({ project, onUpdate, onDelete, showDepts = true, showOwner = true, ownerOptions, onAddOwner, allDepartments, onAddDept }) {
  const [expanded, setExpanded] = useState(false);
  const isAlert = project.priority === "High" && project.pct < 100 && project.date && project.date.includes("3/31");
  const colCount = 9 + (showDepts ? 1 : 0) + (showOwner ? 1 : 0);

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
          </div>
        </td>
        <td className="py-2.5 px-2">
          <TierBadge tier={project.tier || "project"} onChange={(v) => onUpdate(project.id, "tier", v)} />
        </td>
        <td className="py-2.5 px-2 text-center">
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
        </td>
        {showDepts && (
          <td className="py-2.5 px-2" style={{minWidth:100}}><div className="flex items-center gap-1"><DeptChips departments={project.departments} size="xs" /><DeptMultiSelect selected={project.departments} onChange={(d) => onUpdate(project.id, "departments", d)} allDepartments={allDepartments} onAddDept={onAddDept} /></div></td>
        )}
        <td className="py-2.5 px-2"><StatusBadge status={project.status} onChange={(v) => onUpdate(project.id, "status", v)} size="xs" /></td>
        <td className="py-2.5 px-2"><PriorityBadge priority={project.priority} onChange={(v) => onUpdate(project.id, "priority", v)} size="xs" /></td>
        {showOwner && (
          <td className="py-2.5 px-2"><OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} size="xs" ownerOptions={ownerOptions} onAddOwner={onAddOwner} /></td>
        )}
        <td className="py-2.5 px-2 w-32"><ProgressBar value={project.pct} onChange={(v) => onUpdate(project.id, "pct", v)} /></td>
        <td className="py-2.5 px-2 text-xs text-gray-500 whitespace-nowrap"><DatePicker value={project.date} onChange={(v) => onUpdate(project.id, "date", v)} /></td>
        <td className="py-2.5 px-2 text-[10px] text-gray-400 whitespace-nowrap">{project.lastUpdated || "--"}</td>
        <td className="py-2.5 px-1 sticky right-0 bg-white z-10">
          <button onClick={(e) => { e.stopPropagation(); onDelete(project.id); }} className="text-red-300 hover:text-red-500 transition-colors" title="Delete project"><Trash2 size={12} /></button>
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

            {/* Update Log */}
            <div className="mt-3 max-w-3xl">
              <UpdateLog updates={project.updateLog || []} onAdd={(entry) => onUpdate(project.id, "updateLog", [...(project.updateLog || []), entry])} onReplace={(arr) => onUpdate(project.id, "updateLog", arr)} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* =====================================================================
   VIEW: VOTING — Dot voting for project prioritization
   ===================================================================== */

function VotingView({ projects, votingHook }) {
  const { myVotes, dotsRemaining, addDot, removeDot, canVoteIn, votingConfig, votingLoaded } = votingHook;

  if (!votingLoaded) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-gray-200 border-t-indigo-500 rounded-full animate-spin" /></div>;

  const getProjects = (sectionId) => {
    const vs = VOTING_SECTIONS.find(s => s.id === sectionId);
    if (!vs) return [];
    return projects.filter(p => {
      const hasDept = vs.depts.some(d => p.departments.includes(d));
      const isActive = p.status !== "Done";
      const isVoteable = !(votingConfig.nonVoteable || []).includes(p.id);
      return hasDept && isActive && isVoteable;
    });
  };

  const hasAnyRights = VOTING_SECTIONS.some(s => canVoteIn(s.id));

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2"><CircleDot size={15} className="text-indigo-500" /> Your Voting Summary</h2>
        {!hasAnyRights ? (
          <p className="text-xs text-gray-500 italic">You don't have voting rights for any section yet. Ask your admin for access.</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {VOTING_SECTIONS.map(({ id, label, gradient, text }) => {
              const used = DOTS_PER_SECTION - dotsRemaining(id);
              const pct = (used / DOTS_PER_SECTION) * 100;
              const hasRights = canVoteIn(id);
              return (
                <div key={id} className={hasRights ? "" : "opacity-40"}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-gray-600 truncate">{label}</span>
                    <span className={`text-xs font-bold ${text}`}>{hasRights ? `${used}/${DOTS_PER_SECTION}` : "\u2014"}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${gradient} transition-all duration-300`} style={{ width: `${hasRights ? pct : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Voting Sections */}
      {VOTING_SECTIONS.map(({ id, label, icon: Icon, bg, border, text, dotFill, dotRing, dotHover, gradient }) => {
        const sectionProjects = getProjects(id);
        const hasRights = canVoteIn(id);
        const remaining = dotsRemaining(id);

        return (
          <div key={id} className={`rounded-xl border-2 ${border} overflow-hidden`}>
            <div className={`${bg} px-5 py-4 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}><Icon size={18} className="text-white" /></div>
                <div>
                  <h2 className={`text-sm font-bold ${text}`}>{label}</h2>
                  <p className="text-[10px] text-gray-500">{sectionProjects.length} project{sectionProjects.length !== 1 ? "s" : ""} to vote on</p>
                </div>
              </div>
              {hasRights && (
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: DOTS_PER_SECTION }).map((_, i) => (
                    <div key={i} className={`w-3 h-3 rounded-full transition-all ${i < (DOTS_PER_SECTION - remaining) ? dotFill : "bg-white border-2 " + dotRing}`} />
                  ))}
                  <span className={`text-[10px] font-semibold ${text} ml-1`}>{remaining} left</span>
                </div>
              )}
            </div>

            <div className="bg-white p-4">
              {!hasRights ? (
                <div className="text-center py-6">
                  <Lock size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">You don't have voting rights for this section</p>
                </div>
              ) : sectionProjects.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No active voteable projects in this section</p>
              ) : (
                <div className="space-y-2">
                  {sectionProjects.map(p => {
                    const pid = String(p.id || "");
                    const myDots = myVotes[id]?.[pid] || 0;
                    const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG["Not Started"];
                    const priCfg = PRIORITY_CONFIG[p.priority] || PRIORITY_CONFIG["Medium"];
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-500">{String(p.owner || "")}</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusCfg.color}`}>{p.status}</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priCfg.color}`}>{p.priority}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {Array.from({ length: MAX_DOTS_PER_PROJECT }).map((_, i) => {
                            const filled = i < myDots;
                            return (
                              <button key={i} onClick={() => filled ? removeDot(id, p.id) : addDot(id, p.id)}
                                disabled={!filled && remaining <= 0}
                                className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${
                                  filled
                                    ? `${dotFill} text-white shadow-md hover:shadow-lg hover:scale-110`
                                    : remaining > 0
                                      ? `bg-white border-2 ${dotRing} ${dotHover} hover:scale-110 cursor-pointer`
                                      : "bg-gray-50 border-2 border-gray-200 cursor-not-allowed opacity-40"
                                }`}
                                title={filled ? "Click to remove vote" : remaining > 0 ? "Click to add vote" : "No dots remaining"}>
                                {filled && <Check size={12} />}
                              </button>
                            );
                          })}
                          <span className="text-[10px] font-medium text-gray-400 w-4 text-center">{myDots}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =====================================================================
   VIEW: VOTING RESULTS — Admin-only stack rank per section
   ===================================================================== */

function VotingResultsView({ projects, votingHook }) {
  const { allVotes, sectionDotsForProject, votingConfig, votingLoaded } = votingHook;

  if (!votingLoaded) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-gray-200 border-t-indigo-500 rounded-full animate-spin" /></div>;

  const voterCount = Object.keys(votingConfig.voterRights || {}).filter(email => {
    const rights = votingConfig.voterRights[email];
    return rights && rights.length > 0;
  }).length;

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm"><Eye size={18} className="text-white" /></div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">Priority Vote Results</h2>
          <p className="text-[11px] text-gray-500">{voterCount} voter{voterCount !== 1 ? "s" : ""} configured \u2022 Results are live</p>
        </div>
      </div>

      {VOTING_SECTIONS.map(({ id, label, icon: Icon, bg, border, text, gradient }) => {
        const vs = VOTING_SECTIONS.find(s => s.id === id);
        const sectionProjects = projects.filter(p => {
          const hasDept = vs.depts.some(d => p.departments.includes(d));
          return hasDept && p.status !== "Done";
        });

        const ranked = sectionProjects.map(p => ({
          project: p,
          votes: sectionDotsForProject(id, p.id),
          isVoteable: !(votingConfig.nonVoteable || []).includes(p.id),
        })).sort((a, b) => b.votes - a.votes);

        const maxVotes = Math.max(...ranked.map(r => r.votes), 1);

        return (
          <div key={id} className={`rounded-xl border-2 ${border} overflow-hidden`}>
            <div className={`${bg} px-5 py-4 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}><Icon size={18} className="text-white" /></div>
              <h2 className={`text-sm font-bold ${text}`}>{label}</h2>
              <span className={`text-[10px] ${text} ml-auto font-medium`}>{ranked.filter(r => r.votes > 0).length} with votes</span>
            </div>
            <div className="bg-white divide-y divide-gray-100">
              {ranked.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">No active projects in this section</p>
              ) : ranked.map(({ project, votes, isVoteable }, idx) => {
                const barPct = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
                const voters = [];
                Object.entries(allVotes).forEach(([email, uv]) => {
                  const cnt = uv[id]?.[String(project.id || "")] || 0;
                  if (cnt > 0) voters.push({ email, cnt });
                });
                return (
                  <div key={project.id} className={`px-5 py-3 flex items-center gap-4 ${!isVoteable ? "opacity-50" : ""} ${votes === 0 ? "bg-gray-50/50" : ""}`}>
                    <span className={`text-sm font-bold w-7 text-center ${votes > 0 && idx === 0 ? "text-amber-500" : votes > 0 ? "text-gray-600" : "text-gray-300"}`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${votes === 0 ? "text-gray-400" : "text-gray-900"} truncate`}>{project.name}</span>
                        {!isVoteable && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Non-voteable</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">{String(project.owner || "")}</span>
                        {voters.length > 0 && (
                          <span className="text-[10px] text-gray-400">
                            ({voters.map(v => `${v.email.split("@")[0]}:${v.cnt}`).join(", ")})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-40 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-5 overflow-hidden">
                        {votes > 0 && <div className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all`} style={{ width: `${barPct}%` }} />}
                      </div>
                      <span className={`text-xs font-bold w-6 text-right ${votes > 0 ? "text-gray-700" : "text-gray-300"}`}>{votes}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =====================================================================
   VIEW: ALL PROJECTS (default -- flat project list)
   ===================================================================== */

function AllProjectsView({ projects, onUpdate, onDelete, onAdd, ownerOptions, onAddOwner, allDepartments, onAddDept }) {
  const reg=useMemo(()=>projects.filter(p=>p.tier!=="support"),[projects]);
  const sup=useMemo(()=>projects.filter(p=>p.tier==="support"),[projects]);
  const {sorted,sortField,sortDir,onSort}=useSortableProjects(reg);
  const {sorted:supSorted,sortField:supSortField,sortDir:supSortDir,onSort:supOnSort}=useSortableProjects(sup);
  const [supHide,setSupHide]=useState(false);
  const makeTH=(sf,sd,os)=>()=>(<thead><tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider"><th className="py-2.5 px-3 w-8"></th><SortHeader label="Project" field="name" sortField={sf} sortDir={sd} onSort={os} className="py-2.5 px-3"/><SortHeader label="Type" field="tier" sortField={sf} sortDir={sd} onSort={os}/><th className="py-2.5 px-2 text-left">Subtasks</th><SortHeader label="Departments" field="departments" sortField={sf} sortDir={sd} onSort={os}/><SortHeader label="Status" field="status" sortField={sf} sortDir={sd} onSort={os}/><SortHeader label="Priority" field="priority" sortField={sf} sortDir={sd} onSort={os}/><SortHeader label="Owner" field="owner" sortField={sf} sortDir={sd} onSort={os}/><SortHeader label="Progress" field="pct" sortField={sf} sortDir={sd} onSort={os} className="w-24"/><SortHeader label="Est. Date" field="date" sortField={sf} sortDir={sd} onSort={os}/><th className="py-2.5 px-2 text-left" style={{minWidth:60}}>Updated</th><th className="py-2.5 px-1 w-8 sticky right-0 bg-gray-50 z-10"></th></tr></thead>);
  const TH=makeTH(sortField,sortDir,onSort);
  const SupTH=makeTH(supSortField,supSortDir,supOnSort);
  return (<div>
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full" style={{minWidth:1000}}><TH/><tbody>{sorted.map(p=><ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept}/>)}</tbody></table>
      <button onClick={()=>onAdd()} className="w-full text-left px-6 py-3 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100 flex items-center gap-2"><Plus size={12}/> Add project</button>
    </div>
    {sup.length>0&&(<div className="mt-6">
      <button onClick={()=>setSupHide(!supHide)} className="flex items-center gap-2 mb-3"><div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm"><Headphones size={14} className="text-white"/></div><h3 className="text-sm font-bold text-gray-700">Ongoing Support</h3><span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">{sup.length}</span>{supHide?<ChevronRight size={14} className="text-gray-400"/>:<ChevronDown size={14} className="text-gray-400"/>}</button>
      {!supHide&&(<div className="bg-white rounded-xl border border-teal-200 overflow-x-auto"><table className="w-full" style={{minWidth:1000}}><SupTH/><tbody>{supSorted.map(p=><ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept}/>)}</tbody></table><button onClick={()=>onAdd()} className="w-full text-left px-6 py-3 text-xs text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors border-t border-teal-100 flex items-center gap-2"><Plus size={12}/> Add support item</button></div>)}
    </div>)}
  </div>);
}

/* =====================================================================
   VIEW: BY OWNER (for 1:1 meetings)
   ===================================================================== */

function ByOwnerView({ projects, onUpdate, onDelete, onAdd, ownerOptions, onAddOwner, allDepartments, onAddDept }) {
  const opts = ownerOptions || OWNER_OPTIONS;
  const ownerGroups = useMemo(() => {
    const groups = {};
    for (const o of opts.filter(o => o !== "Unassigned")) groups[o] = [];
    for (const p of projects) {
      if (groups[p.owner]) groups[p.owner].push(p);
    }
    const unassigned = projects.filter(p => p.owner === "Unassigned");
    if (unassigned.length) groups["Unassigned"] = unassigned;
    return groups;
  }, [projects, opts]);

  return (
    <div className="space-y-6">
      {Object.entries(ownerGroups).filter(([, ps]) => ps.length > 0).map(([owner, ps]) => {
        const initials = owner === "Unassigned" ? "?" : String(owner || "").split(" ").map(n => n[0]).join("");
        const highCount = ps.filter(p => p.priority === "High").length;
        const blockedCount = ps.filter(p => p.status === "Blocked" || p.status === "On Hold").length;

        return (
          <OwnerSection key={owner} owner={owner} initials={initials} projects={ps}
            highCount={highCount} blockedCount={blockedCount}
            onUpdate={onUpdate} onDelete={onDelete} onAdd={onAdd}
            ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept} />
        );
      })}
    </div>
  );
}

function OwnerSection({ owner, initials, projects, highCount, blockedCount, onUpdate, onDelete, onAdd, ownerOptions, onAddOwner, allDepartments, onAddDept }) {
  const [collapsed, setCollapsed] = useState(false);
  const { sorted, sortField, sortDir, onSort } = useSortableProjects(projects);

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
        <div className="border-t border-gray-100 overflow-x-auto">

          <table className="w-full" style={{minWidth:1000}}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-2 px-3 w-8"></th>
                <SortHeader label="Project" field="name" sortField={sortField} sortDir={sortDir} onSort={onSort} className="py-2 px-3" />
                <SortHeader label="Type" field="tier" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="py-2 px-2 text-left">Subtasks</th>
                <SortHeader label="Departments" field="departments" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Progress" field="pct" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-24" />
                <SortHeader label="Est. Date" field="date" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="py-2 px-2 text-left" style={{minWidth:60}}>Updated</th>
                <th className="py-2 px-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} showOwner={false} ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept} />
              ))}
            </tbody>
          </table>
          <button onClick={() => onAdd(owner)} className="w-full text-left px-6 py-2 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-50 flex items-center gap-2">
            <Plus size={12} /> Add project for {String(owner || "").split(" ")[0]}
          </button>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   VIEW: BY DEPARTMENT
   ===================================================================== */

function ByDeptView({ projects, onUpdate, onDelete, onAdd, ownerOptions, onAddOwner, allDepartments, onAddDept }) {
  const deptList = allDepartments || DEPARTMENTS;
  const DEFAULT_DEPT_CFG = { icon: Building2, gradient: "from-gray-500 to-gray-600", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", light: "bg-gray-100", chip: "bg-gray-50 text-gray-700 border-gray-200" };
  const deptGroups = useMemo(() => {
    const groups = {};
    for (const d of deptList) groups[d] = [];
    for (const p of projects) {
      for (const d of p.departments) {
        if (!groups[d]) groups[d] = [];
        groups[d].push(p);
      }
    }
    return groups;
  }, [projects, deptList]);

  return (
    <div className="space-y-6">
      {deptList.map(dept => {
        const ps = deptGroups[dept] || [];
        if (ps.length === 0) return null;
        const cfg = DEPT_CONFIG[dept] || DEFAULT_DEPT_CFG;
        const Icon = cfg.icon;
        const highCount = ps.filter(p => p.priority === "High").length;
        const totalPct = ps.length ? Math.round(ps.reduce((s, p) => s + p.pct, 0) / ps.length) : 0;

        return (
          <DeptSection key={dept} dept={dept} cfg={cfg} Icon={Icon} projects={ps}
            highCount={highCount} totalPct={totalPct}
            onUpdate={onUpdate} onDelete={onDelete} onAdd={() => onAdd(null, dept)}
            ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept} />
        );
      })}
    </div>
  );
}

function DeptSection({ dept, cfg, Icon, projects, highCount, totalPct, onUpdate, onDelete, onAdd, ownerOptions, onAddOwner, allDepartments, onAddDept }) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("cards");
  const { sorted, sortField, sortDir, onSort } = useSortableProjects(projects);

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
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full" style={{minWidth:1000}}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="py-2 px-3 w-8"></th>
                    <SortHeader label="Project" field="name" sortField={sortField} sortDir={sortDir} onSort={onSort} className="py-2 px-3" />
                    <SortHeader label="Type" field="tier" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <th className="py-2 px-2 text-left">Subtasks</th>
                    <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Owner" field="owner" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Progress" field="pct" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-24" />
                    <SortHeader label="Est. Date" field="date" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <th className="py-2 px-2 text-left" style={{minWidth:60}}>Updated</th>
                    <th className="py-2 px-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(p => <ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} showDepts={false} ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept} />)}
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

/* =====================================================================
   MARK-DONE CONFIRMATION MODAL
   ===================================================================== */
function MarkDoneModal({ project, onConfirm, onCancel }) {
  const [note, setNote] = useState("");
  if (!project) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-600 to-green-700 px-5 py-3.5 flex items-center gap-2">
          <CheckCircle size={16} className="text-white" />
          <h3 className="text-sm font-bold text-white">Mark Project as Done?</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700">
            Are you sure you want to mark <span className="font-semibold">"{project.name}"</span> as Done? It will move to the History tab.
          </p>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Final Notes (optional)</label>
            <textarea
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              placeholder="Any closing notes, outcomes, lessons learned..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">This will be added to the project's update log.</p>
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm(note.trim())} className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5">
            <CheckCircle size={12} />Mark as Done
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryView({ completedProjects, onUpdate, onRestore }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

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
            <th className="py-2.5 px-3 w-8"></th>
            <th className="py-2.5 px-3 text-left">Project</th>
            <th className="py-2.5 px-2 text-left">Departments</th>
            <th className="py-2.5 px-2 text-left">Owner</th>
            <th className="py-2.5 px-2 text-left">Priority</th>
            <th className="py-2.5 px-2 text-left">Completed</th>
            <th className="py-2.5 px-2 text-left">Notes</th>
            <th className="py-2.5 px-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {completedProjects.map(p => (<Fragment key={p.id}>
            <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => toggle(p.id)}>
              <td className="py-3 px-3 text-gray-400">{expanded[p.id] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
              <td className="py-3 px-3">
                <span className="text-sm font-medium text-gray-700">{p.name}</span>
              </td>
              <td className="py-3 px-2"><DeptChips departments={p.departments} size="xs" /></td>
              <td className="py-3 px-2 text-xs text-gray-600">{p.owner}</td>
              <td className="py-3 px-2"><PriorityBadge priority={p.priority} onChange={(v) => onUpdate(p.id, "priority", v)} size="xs" /></td>
              <td className="py-3 px-2 text-xs text-gray-500">{p.completedDate || "--"}</td>
              <td className="py-3 px-2 text-xs text-gray-400 max-w-xs truncate">{p.notes || p.milestones || "--"}</td>
              <td className="py-3 px-2 text-right" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { if (window.confirm(`Move "${p.name}" back to Active Projects? This will clear its completed date.`)) onRestore(p.id); }}
                  className="text-[10px] font-medium text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
                  title="Move back to active"
                ><RotateCcw size={10}/>Reactivate</button>
              </td>
            </tr>
            {expanded[p.id] && (
              <tr className="bg-gray-50/30">
                <td colSpan={8} className="px-6 py-4">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
                    <div><span className="font-semibold text-gray-500 uppercase text-[10px] block mb-0.5">Roadblocks</span><span className="text-gray-700">{p.roadblocks || "None"}</span></div>
                    <div><span className="font-semibold text-gray-500 uppercase text-[10px] block mb-0.5">Milestones</span><span className="text-gray-700">{p.milestones || "None"}</span></div>
                    <div><span className="font-semibold text-gray-500 uppercase text-[10px] block mb-0.5">Next Steps</span><span className="text-gray-700">{p.nextSteps || "None"}</span></div>
                    <div><span className="font-semibold text-gray-500 uppercase text-[10px] block mb-0.5">Notes</span><span className="text-gray-700">{p.notes || "None"}</span></div>
                    {p.subtasks && p.subtasks.length > 0 && (
                      <div className="col-span-2"><span className="font-semibold text-gray-500 uppercase text-[10px] block mb-0.5">Subtasks</span>{p.subtasks.map((st,i)=>(<div key={i} className="flex items-center gap-1.5 text-gray-700"><span>{st.done ? "\u2705" : "\u2B1C"}</span><span className={st.done ? "line-through text-gray-400" : ""}>{st.name}</span></div>))}</div>
                    )}
                    <div><span className="font-semibold text-gray-500 uppercase text-[10px] block mb-0.5">Est. Date</span><span className="text-gray-700">{p.date || "N/A"}</span></div>
                    <div><span className="font-semibold text-gray-500 uppercase text-[10px] block mb-0.5">Last Updated</span><span className="text-gray-700">{p.lastUpdated || "N/A"}</span></div>
                    <div className="col-span-2">
                      <span className="font-semibold text-gray-500 uppercase text-[10px] block mb-1">Update Log ({(p.updateLog || []).length})</span>
                      {(p.updateLog || []).length === 0 ? (
                        <span className="text-gray-400 italic">No updates were logged for this project.</span>
                      ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white p-2">
                          {[...(p.updateLog || [])].reverse().map((u, i) => (
                            <div key={i} className="border-l-2 border-blue-300 pl-2 py-1">
                              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <span className="font-semibold text-gray-600">{u.date || "--"}</span>
                                {u.author && <span>by {u.author}</span>}
                              </div>
                              <div className="text-gray-700 whitespace-pre-wrap">{u.notes || ""}</div>
                              {Array.isArray(u.links) && u.links.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {u.links.map((lk, j) => (
                                    <a key={j} href={lk.url || lk} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5"><Link2 size={9}/>{lk.label || lk.url || lk}</a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>))}
        </tbody>
      </table>
    </div>
  );
}

/* =====================================================================
   VIEW: CHANGE LOG (field-level audit trail)
   ===================================================================== */

function ChangeLogView({changeLog,onUndo}){
  const [clF,setClF]=useState("");
  const FL={name:"Name",status:"Status",priority:"Priority",owner:"Owner",pct:"Progress",date:"Est. Completion",departments:"Departments",roadblocks:"Roadblocks",milestones:"Milestones",nextSteps:"Next Steps",notes:"Notes",tier:"Tier",completedDate:"Completed Date"};
  const fLog=useMemo(()=>{if(!clF)return changeLog;const q=clF.toLowerCase();return changeLog.filter(e=>(e.projectName||"").toLowerCase().includes(q)||(FL[e.field]||e.field||"").toLowerCase().includes(q)||(e.user||"").toLowerCase().includes(q));},[changeLog,clF]);
  if(changeLog.length===0)return(<div className="bg-white rounded-xl border border-gray-200 p-12 text-center"><History size={40} className="text-gray-200 mx-auto mb-3"/><h3 className="font-bold text-gray-400 text-lg">No Changes Yet</h3><p className="text-sm text-gray-300 mt-1">When you edit project fields, every change will be logged here so you can track and undo changes.</p></div>);
  return(<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between"><div className="flex items-center gap-2"><History size={14} className="text-blue-500"/><span className="text-sm font-bold text-gray-700">{changeLog.length} Change{changeLog.length!==1?"s":""} Logged</span></div><div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 border border-gray-200 w-56"><Search size={12} className="text-gray-400"/><input value={clF} onChange={e=>setClF(e.target.value)} className="text-xs bg-transparent focus:outline-none w-full" placeholder="Filter by project or field..."/></div></div>
    <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">{fLog.map(entry=>(<div key={entry.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors flex items-start gap-3"><div className="flex-shrink-0 mt-0.5"><div className="w-6 h-6 bg-blue-50 rounded-full flex items-center justify-center"><Edit3 size={10} className="text-blue-500"/></div></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold text-gray-800">{entry.projectName}</span><span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{FL[entry.field]||entry.field}</span></div><div className="flex items-center gap-1.5 mt-1 text-xs"><span className="text-red-400 line-through max-w-[200px] truncate" title={entry.oldValue}>{entry.oldValue}</span><ArrowRight size={10} className="text-gray-300 flex-shrink-0"/><span className="text-emerald-600 font-medium max-w-[200px] truncate" title={entry.newValue}>{entry.newValue}</span></div><div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400"><span>{entry.timestamp}</span><span>by {entry.user}</span></div></div><button onClick={()=>onUndo(entry)} className="flex-shrink-0 text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors flex items-center gap-1" title="Undo this change"><RotateCcw size={10}/> Undo</button></div>))}</div>
  </div>);
}

/* =====================================================================
   VIEW: INBOX (triage area for new requests & unassigned items)
   ===================================================================== */

/* =====================================================================
   PDF EXPORT DIALOG (section picker)
   ===================================================================== */

function ExportPDFDialog({ onClose, projects, stats, alerts, completedProjects, changeLog, ownerOptions }) {
  const [sections, setSections] = useState({
    summary: true,
    activeProjects: true,
    ongoingSupport: true,
    blocked: true,
    byOwner: false,
    completed: false,
    changeLog: false,
  });

  const toggle = (key) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const activeProjects = projects.filter(p => p.status !== "Done");

  const handleExport = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    let html = `<!DOCTYPE html><html><head><title>IT Project Dashboard Report</title>
<style>
  @page { margin: 0.75in; size: letter; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1f2937; line-height: 1.5; }
  h1 { font-size: 20px; color: #111827; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #374151; margin-top: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 12px; color: #4b5563; margin-top: 16px; }
  .subtitle { font-size: 11px; color: #9ca3af; margin-bottom: 16px; }
  .stat-row { display: flex; gap: 16px; margin: 12px 0; }
  .stat-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 14px; text-align: center; flex: 1; }
  .stat-num { font-size: 20px; font-weight: 700; color: #111827; }
  .stat-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  th { background: #f9fafb; border-bottom: 2px solid #e5e7eb; padding: 6px 8px; text-align: left; font-weight: 600; color: #6b7280; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  tr:hover { background: #f9fafb; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
  .high { background: #fef2f2; color: #b91c1c; }
  .medium { background: #fffbeb; color: #92400e; }
  .low { background: #f0fdf4; color: #15803d; }
  .footer { margin-top: 32px; text-align: center; font-size: 9px; color: #d1d5db; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>`;

    html += `<h1>IT Project Dashboard</h1><div class="subtitle">Aubuchon Hardware -- ${dateStr}</div>`;

    if (sections.summary) {
      html += `<h2>Summary</h2>`;
      html += `<div class="stat-row">`;
      html += `<div class="stat-box"><div class="stat-num">${stats.total}</div><div class="stat-label">Active</div></div>`;
      html += `<div class="stat-box"><div class="stat-num">${stats.inProgress}</div><div class="stat-label">In Progress</div></div>`;
      html += `<div class="stat-box"><div class="stat-num">${stats.highPriority}</div><div class="stat-label">High Priority</div></div>`;
      html += `<div class="stat-box"><div class="stat-num">${stats.avgProgress}%</div><div class="stat-label">Avg Progress</div></div>`;
      html += `<div class="stat-box"><div class="stat-num">${stats.blocked}</div><div class="stat-label">Blocked</div></div>`;
      html += `<div class="stat-box"><div class="stat-num">${stats.done}</div><div class="stat-label">Completed</div></div>`;
      html += `</div>`;
    }

    if (sections.activeProjects) {
      const items = activeProjects.filter(p => p.tier !== "support");
      html += `<h2>Active Projects (${items.length})</h2>`;
      html += `<table><tr><th>Project</th><th>Department</th><th>Status</th><th>Priority</th><th>Owner</th><th>Progress</th><th>Est. Completion</th></tr>`;
      for (const p of items) {
        html += `<tr><td><strong>${p.name}</strong></td><td>${p.departments.join(", ")}</td><td>${p.status}</td><td><span class="badge ${p.priority.toLowerCase()}">${p.priority}</span></td><td>${p.owner}</td><td>${p.pct}%</td><td>${p.date || "--"}</td></tr>`;
      }
      html += `</table>`;
    }

    if (sections.ongoingSupport) {
      const items = activeProjects.filter(p => p.tier === "support");
      if (items.length > 0) {
        html += `<h2>Ongoing Support (${items.length})</h2>`;
        html += `<table><tr><th>Item</th><th>Department</th><th>Priority</th><th>Owner</th><th>Notes</th></tr>`;
        for (const p of items) {
          html += `<tr><td><strong>${p.name}</strong></td><td>${p.departments.join(", ")}</td><td><span class="badge ${p.priority.toLowerCase()}">${p.priority}</span></td><td>${p.owner}</td><td>${(p.notes || "").slice(0, 80)}${(p.notes || "").length > 80 ? "..." : ""}</td></tr>`;
        }
        html += `</table>`;
      }
    }

    if (sections.blocked) {
      const items = activeProjects.filter(p => p.status === "Blocked" || p.status === "On Hold");
      if (items.length > 0) {
        html += `<h2>Blocked / On Hold (${items.length})</h2>`;
        html += `<table><tr><th>Project</th><th>Owner</th><th>Status</th><th>Roadblocks</th></tr>`;
        for (const p of items) {
          html += `<tr><td><strong>${p.name}</strong></td><td>${p.owner}</td><td>${p.status}</td><td>${p.roadblocks || "No details"}</td></tr>`;
        }
        html += `</table>`;
      }
    }

    if (sections.byOwner) {
      html += `<h2>By Owner</h2>`;
      for (const owner of (ownerOptions || OWNER_OPTIONS).filter(o => o !== "Unassigned")) {
        const ownerPs = activeProjects.filter(p => p.owner === owner);
        if (ownerPs.length === 0) continue;
        html += `<h3>${owner} (${ownerPs.length})</h3>`;
        html += `<table><tr><th>Project</th><th>Status</th><th>Priority</th><th>Progress</th></tr>`;
        for (const p of ownerPs) {
          html += `<tr><td>${p.name}</td><td>${p.status}</td><td><span class="badge ${p.priority.toLowerCase()}">${p.priority}</span></td><td>${p.pct}%</td></tr>`;
        }
        html += `</table>`;
      }
    }

    if (sections.completed && completedProjects.length > 0) {
      html += `<h2>Completed Projects (${completedProjects.length})</h2>`;
      html += `<table><tr><th>Project</th><th>Owner</th><th>Completed</th></tr>`;
      for (const p of completedProjects) {
        html += `<tr><td>${p.name}</td><td>${p.owner}</td><td>${p.completedDate || "--"}</td></tr>`;
      }
      html += `</table>`;
    }

    if (sections.changeLog && changeLog.length > 0) {
      html += `<h2>Recent Changes (last 50)</h2>`;
      html += `<table><tr><th>When</th><th>Project</th><th>Field</th><th>From</th><th>To</th><th>By</th></tr>`;
      for (const e of changeLog.slice(0, 50)) {
        html += `<tr><td>${e.timestamp}</td><td>${e.projectName}</td><td>${e.field}</td><td>${e.oldValue}</td><td>${e.newValue}</td><td>${e.user}</td></tr>`;
      }
      html += `</table>`;
    }

    html += `<div class="footer">Aubuchon Hardware -- IT Department -- Generated ${dateStr}</div>`;
    html += `</body></html>`;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
    onClose();
  };

  const sectionList = [
    ["summary", "Executive Summary", "Stats overview with key metrics"],
    ["activeProjects", "Active Projects", "All non-support project items"],
    ["ongoingSupport", "Ongoing Support", "Support and operations items"],
    ["blocked", "Blocked / On Hold", "Items currently blocked or paused"],
    ["byOwner", "By Owner", "Projects grouped by team member"],
    ["completed", "Completed Projects", "Previously finished projects"],
    ["changeLog", "Recent Changes", "Last 50 field-level changes"],
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[420px] max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">Export to PDF</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 mb-3">Select sections to include in the report:</p>
          <div className="space-y-2">
            {sectionList.map(([key, label, desc]) => (
              <label key={key} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <input type="checkbox" checked={sections[key]} onChange={() => toggle(key)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <div>
                  <div className="text-xs font-semibold text-gray-700">{label}</div>
                  <div className="text-[10px] text-gray-400">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-2 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleExport} className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5">
            <Download size={12} /> Generate PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function InboxView({ inboxItems, setInboxItems, onPromote, ownerOptions, onAddOwner }) {
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
   PENDING JIFFY VIEW
   Lists invoices currently sitting in Firestore with jiffyAction === "pending".
   Driven by the same real-time snapshot as the header pill.
   ===================================================================== */

function PendingJiffyView({ invoices, onBack }) {
  const fmtMoney = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtTime = (ts) => {
    if (!ts) return "";
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    if (ts.toDate) try { return ts.toDate().toLocaleString(); } catch (e) { return ""; }
    return String(ts);
  };
  const sorted = [...(invoices || [])].sort((a, b) => {
    const ta = a.actionedAt?.seconds || 0;
    const tb = b.actionedAt?.seconds || 0;
    return tb - ta;
  });
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Pending Jiffy submissions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Invoices approved/rejected in Workbench but not yet submitted to Jiffy. The scheduled task processes these at 6:30 PM ET daily.
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            <ArrowLeft size={12} /> Back
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          Jiffy queue is empty. Nothing pending submission.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 800 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Invoice #</th>
                <th className="py-2 pr-3 font-medium">Vendor</th>
                <th className="py-2 pr-3 font-medium text-right">Amount</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Group</th>
                <th className="py-2 pr-3 font-medium">Approved at</th>
                <th className="py-2 pr-3 font-medium">Approved by</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(inv => (
                <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-3 font-mono text-gray-900">{inv.invoiceNumber || inv.id}</td>
                  <td className="py-2 pr-3 text-gray-700">{inv.vendor || "—"}</td>
                  <td className="py-2 pr-3 text-right text-gray-900">{fmtMoney(inv.amount)}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${inv.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {inv.status || "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-700">{inv.jiffyGroup || inv.category || "—"}</td>
                  <td className="py-2 pr-3 text-gray-600">{fmtTime(inv.actionedAt)}</td>
                  <td className="py-2 pr-3 text-gray-600">{inv.actionedBy || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   MAIN DASHBOARD
   ===================================================================== */

function ITProjectDashboard({ goHome, isAdmin, allAccessUsers }) {
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
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [changeLog, setChangeLog] = useState([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [customOwners, setCustomOwners] = useState([]);
  const [customDepartments, setCustomDepartments] = useState([]);
  const [markDonePending, setMarkDonePending] = useState(null); // {id, name} | null
  const [pendingJiffyInvoices, setPendingJiffyInvoices] = useState([]);

  // Real-time subscription to invoices waiting for Jiffy submission.
  // Powers the header pill AND the PendingJiffyView table from a single snapshot.
  useEffect(() => {
    const q = query(collection(db, "ap_invoices"), where("jiffyAction", "==", "pending"));
    const unsub = onSnapshot(
      q,
      (snap) => setPendingJiffyInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Pending Jiffy snapshot failed:", err)
    );
    return () => unsub();
  }, []);

  const allOwners = useMemo(() => [...OWNER_OPTIONS, ...customOwners.filter(o => !OWNER_OPTIONS.includes(o))], [customOwners]);
  const allDepartments = useMemo(() => [...DEPARTMENTS, ...customDepartments.filter(d => !DEPARTMENTS.includes(d))], [customDepartments]);

  const votingHook = useVoting(projects);

  const handleAddOwner = useCallback((name) => {
    setCustomOwners(prev => prev.includes(name) ? prev : [...prev, name]);
  }, []);

  const handleAddDept = useCallback((name) => {
    setCustomDepartments(prev => prev.includes(name) ? prev : [...prev, name]);
  }, []);

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
          if (d.projects) { const migrated=d.projects.map(p=>p.date==="Ongoing"&&p.tier!=="support"?{...p,tier:"support"}:p); setProjects(migrated); const maxExisting=Math.max(0,...migrated.map(p=>typeof p.id==="number"?p.id:0)); setNextId(maxExisting+1); }
          if (d.inboxItems) setInboxItems(d.inboxItems);
          if (d.trashedProjects) { setTrashedProjects(d.trashedProjects); const trashedMax=Math.max(0,...d.trashedProjects.map(p=>typeof p.id==="number"?p.id:0)); setNextId(prev=>Math.max(prev,trashedMax+1)); }
          if (d.changeLog) setChangeLog(d.changeLog);
          if (d.customOwners) setCustomOwners(d.customOwners);
          if (d.customDepartments) setCustomDepartments(d.customDepartments);
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
        changeLog,
        customOwners,
        customDepartments,
        lastSaved: new Date().toISOString(),
      }).catch(err => console.warn("Firestore save failed:", err));
    }, 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [projects, inboxItems, trashedProjects, changeLog, customOwners, customDepartments]);

  // Derived data
  const activeProjects = useMemo(() => projects.filter(p => p.status !== "Done"), [projects]);
  const completedProjects = useMemo(() => projects.filter(p => p.status === "Done"), [projects]);

  const filtered = useMemo(() => {
    return activeProjects.filter(p => {
      if (filterOwner !== "All" && p.owner !== filterOwner) return false;
      if (filterStatus !== "All" && p.status !== filterStatus) return false;
      if (filterPriority !== "All" && p.priority !== filterPriority) return false;
      if (filterDept !== "All" && !p.departments.includes(filterDept)) return false;
      if (filterTier !== "All") { const tierMap={"Project":"project","Quick Win":"quickwin","Ongoing Support":"support"}; if(p.tier!==tierMap[filterTier]) return false; }
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
    // Intercept: when moving a project to Done, require confirmation via modal.
    if (field === "status" && value === "Done") {
      const proj = projects.find(p => p.id === id);
      if (proj && proj.status !== "Done") {
        setMarkDonePending({ id, name: proj.name });
        return;
      }
    }
    const now = new Date();
    const ts = now.toLocaleDateString("en-US")+" "+now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const oldVal = p[field];
      const updated = { ...p, [field]: value, lastUpdated: ts };
      if (field==="status"&&value==="Done"&&!p.completedDate) { updated.completedDate=new Date().toLocaleDateString("en-US"); updated.pct=100; }
      if (field==="status"&&value!=="Done"&&p.status==="Done") { updated.completedDate=""; }
      if (!["updateLog","subtasks"].includes(field)) {
        const fmt=(v)=>Array.isArray(v)?v.join(", "):(v===""||v===null||v===undefined?"(empty)":String(v));
        setChangeLog(prev=>[{id:Date.now(),timestamp:ts,projectId:id,projectName:p.name,field,oldValue:fmt(oldVal),newValue:fmt(value),user:auth.currentUser?.displayName||auth.currentUser?.email||"Unknown"},...prev].slice(0,500));
      }
      return updated;
    }));
  }, [projects]);

  // Confirm marking a project as Done (called by MarkDoneModal)
  const confirmMarkDone = useCallback((finalNote) => {
    if (!markDonePending) return;
    const id = markDonePending.id;
    const now = new Date();
    const ts = now.toLocaleDateString("en-US")+" "+now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    const todayStr = new Date().toLocaleDateString("en-US");
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const oldStatus = p.status;
      const updated = { ...p, status: "Done", pct: 100, completedDate: todayStr, lastUpdated: ts };
      if (finalNote) {
        const entry = { date: todayStr, notes: finalNote, links: [], author: auth.currentUser?.displayName || auth.currentUser?.email || "Scott" };
        updated.updateLog = [...(p.updateLog || []), entry];
      }
      const fmt=(v)=>Array.isArray(v)?v.join(", "):(v===""||v===null||v===undefined?"(empty)":String(v));
      setChangeLog(prevCL=>[{id:Date.now(),timestamp:ts,projectId:id,projectName:p.name,field:"status",oldValue:fmt(oldStatus),newValue:"Done",user:auth.currentUser?.displayName||auth.currentUser?.email||"Unknown"},...prevCL].slice(0,500));
      return updated;
    }));
    setMarkDonePending(null);
  }, [markDonePending]);

  // Reactivate a completed project (move it back to Active)
  const handleReactivate = useCallback((id) => {
    const now = new Date();
    const ts = now.toLocaleDateString("en-US")+" "+now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, status: "In Progress", completedDate: "", lastUpdated: ts };
      setChangeLog(prevCL=>[{id:Date.now(),timestamp:ts,projectId:id,projectName:p.name,field:"status",oldValue:"Done",newValue:"In Progress (Reactivated)",user:auth.currentUser?.displayName||auth.currentUser?.email||"Unknown"},...prevCL].slice(0,500));
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

  const handleAddProject = useCallback((data) => {
    const newId = Date.now();
    const newP = {
      id: newId,
      departments: data?.departments || ["Enterprise Systems"],
      name: data?.name || "New Project",
      owner: data?.owner || "Unassigned",
      status: data?.status || "Not Started",
      priority: data?.priority || "Medium",
      pct: 0,
      date: data?.tier === "support" ? "Ongoing" : "",
      roadblocks: "",
      milestones: "",
      nextSteps: "",
      notes: "",
      completedDate: "",
      subtasks: [],
      tier: data?.tier || "project",
      lastUpdated: new Date().toLocaleDateString("en-US")+" "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
    };
    setProjects(prev => [...prev, newP]);
    setNextId(n => Math.max(n, newId) + 1);
  }, []);

  const handlePromoteInbox = useCallback((item, tier) => {
    const newId = Date.now();
    const newP = {
      id: newId,
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
    setNextId(n => Math.max(n, newId) + 1);
  }, []);

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

  const handleUndoChange = useCallback((entry) => {
    if (!window.confirm(`Undo "${entry.field}" on "${entry.projectName}"? Revert to "${entry.oldValue}"?`)) return;
    const rv=entry.oldValue==="(empty)"?"":entry.oldValue;
    const fv=entry.field==="departments"?String(rv || "").split(", ").filter(Boolean):(entry.field==="pct"?Number(rv):rv);
    handleUpdate(entry.projectId, entry.field, fv);
    setChangeLog(prev=>prev.filter(e=>e.id!==entry.id));
  }, [handleUpdate]);

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
              {goHome && (
                <button onClick={goHome} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" title="Back to Home">
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
                <BarChart3 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">IT Project Dashboard</h1>
                <p className="text-[11px] text-gray-400">Aubuchon Hardware -- Week of March 30, 2026</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={()=>setShowReviewModal(true)} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors shadow-sm"><Eye size={13}/>Review</button>
              <button onClick={()=>setShowExportDialog(true)} className="flex items-center gap-1.5 bg-gray-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors shadow-sm"><Download size={13}/>Export</button>
              <span className="text-[10px] text-gray-300 px-1">Auto-saved</span>
              <button
                onClick={() => setActiveView("pendingJiffy")}
                title={pendingJiffyInvoices.length === 0 ? "No invoices waiting for Jiffy submission" : `${pendingJiffyInvoices.length} invoice(s) queued for Jiffy submission`}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  pendingJiffyInvoices.length === 0
                    ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    : "bg-amber-100 text-amber-800 hover:bg-amber-200 animate-pulse"
                }`}
              >
                Jiffy queue: {pendingJiffyInvoices.length === 0 ? "0" : `${pendingJiffyInvoices.length} pending`}
              </button>
              <button onClick={() => signOut(auth)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          </div>

          {/* View tabs */}
          <div className="flex items-center gap-1 mt-3 -mb-px flex-wrap">
            {[...VIEWS, ...(isAdmin ? [{ id: "voteResults", label: "Vote Results", icon: Eye }] : [])].map(v => {
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
                  {v.id === "history" && completedProjects.length > 0 && (<span className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{completedProjects.length}</span>)}
                  {v.id === "changelog" && changeLog.length > 0 && (<span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{changeLog.length}</span>)}
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
        {alerts.length > 0 && activeView !== "history" && activeView !== "changelog" && activeView !== "voting" && activeView !== "voteResults" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-red-800">Critical Deadlines This Week</h4>
              <p className="text-xs text-red-600 mt-0.5">{alerts.map(p => `${p.name} (${p.owner})`).join("  |  ")} -- due 3/31/2026</p>
            </div>
          </div>
        )}

        {/* FILTERS */}
        {activeView !== "history" && activeView !== "changelog" && activeView !== "voting" && activeView !== "voteResults" && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-gray-200 flex-1 max-w-xs">
              <Search size={14} className="text-gray-400" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="text-xs bg-transparent focus:outline-none w-full" placeholder="Search projects..." />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>}
            </div>

            <div className="flex bg-gray-100 rounded-lg p-0.5 border border-gray-200">
              {["All","Project","Quick Win","Ongoing Support"].map(t=>(<button key={t} onClick={()=>setFilterTier(t)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterTier===t?"bg-white shadow-sm text-gray-900":"text-gray-400 hover:text-gray-600"}`}>{t==="Quick Win"&&<Zap size={11} className="inline mr-1"/>}{t==="Ongoing Support"&&<Headphones size={11} className="inline mr-1"/>}{t==="All"?"All":t}</button>))}
            </div>

            <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-2 border border-gray-200">
              <User size={12} className="text-gray-400" />
              <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="text-xs text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer">
                <option value="All">All Owners</option>
                {allOwners.filter(o => o !== "Unassigned").map(o => <option key={o} value={o}>{o}</option>)}
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
                {allDepartments.map(d => <option key={d} value={d}>{DEPT_SHORT[d] || d}</option>)}
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
          <AllProjectsView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete} onAdd={()=>setShowNewProjectModal(true)} ownerOptions={allOwners} onAddOwner={handleAddOwner} allDepartments={allDepartments} onAddDept={handleAddDept} />
        )}

        {activeView === "owner" && (
          <ByOwnerView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete}
            onAdd={()=>setShowNewProjectModal(true)} ownerOptions={allOwners} onAddOwner={handleAddOwner} allDepartments={allDepartments} onAddDept={handleAddDept} />
        )}

        {activeView === "dept" && (
          <ByDeptView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete}
            onAdd={()=>setShowNewProjectModal(true)} ownerOptions={allOwners} onAddOwner={handleAddOwner} allDepartments={allDepartments} onAddDept={handleAddDept} />
        )}

        {activeView === "inbox" && (
          <InboxView inboxItems={inboxItems} setInboxItems={setInboxItems} onPromote={handlePromoteInbox} ownerOptions={allOwners} onAddOwner={handleAddOwner} />
        )}

        {activeView === "trash" && (
          <TrashView trashedProjects={trashedProjects} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} />
        )}

        {activeView === "history" && (<HistoryView completedProjects={completedProjects} onUpdate={handleUpdate} onRestore={handleReactivate} />)}

        {activeView === "changelog" && (<ChangeLogView changeLog={changeLog} onUndo={handleUndoChange} />)}

        {activeView === "voting" && (<VotingView projects={projects} votingHook={votingHook} />)}

        {activeView === "voteResults" && isAdmin && (<VotingResultsView projects={projects} votingHook={votingHook} allUsers={allAccessUsers} />)}

        {activeView === "pendingJiffy" && (<PendingJiffyView invoices={pendingJiffyInvoices} onBack={() => setActiveView("projects")} />)}

        {showExportDialog && (<ExportPDFDialog onClose={()=>setShowExportDialog(false)} projects={projects} stats={stats} alerts={alerts} completedProjects={completedProjects} changeLog={changeLog} ownerOptions={allOwners} />)}

        {showNewProjectModal && (
          <NewProjectModal
            ownerOptions={allOwners}
            allDepartments={allDepartments}
            onClose={() => setShowNewProjectModal(false)}
            onSave={(data) => { handleAddProject(data); clearFilters(); setActiveView("projects"); }}
          />
        )}

        {markDonePending && (
          <MarkDoneModal
            project={markDonePending}
            onCancel={() => setMarkDonePending(null)}
            onConfirm={confirmMarkDone}
          />
        )}

        {showReviewModal && activeProjects.length > 0 && (
          <ReviewProjectsModal
            projects={activeProjects}
            allDepartments={allDepartments}
            onUpdate={handleUpdate}
            onClose={() => setShowReviewModal(false)}
          />
        )}

        {/* FOOTER */}
        <div className="text-center py-6 text-[11px] text-gray-300 mt-4">
          Aubuchon Hardware -- IT Department -- Click any field to edit | Changes auto-save | Projects can belong to multiple departments
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   HOME SCREEN  --  Navigation hub for all IT Command Center sections
   ===================================================================== */

const SECTIONS = [
  {
    id: "projects",
    label: "Projects",
    description: "IT Project Dashboard -- track status, priorities, and progress across all departments",
    icon: Briefcase,
    gradient: "from-blue-500 to-blue-700",
    hoverGradient: "from-blue-600 to-blue-800",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    shadow: "shadow-blue-200/50",
    active: true,
  },
  {
    id: "ap-invoices",
    label: "AP Invoices",
    description: "Accounts Payable invoice tracking and approval workflow",
    icon: FileText,
    gradient: "from-orange-400 to-orange-600",
    hoverGradient: "from-orange-500 to-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    shadow: "shadow-orange-200/50",
    active: true,
  },
  {
    id: "wells-cc",
    label: "Wells CC",
    description: "Wells Fargo corporate credit card transaction management",
    icon: CreditCard,
    gradient: "from-red-500 to-red-700",
    hoverGradient: "from-red-600 to-red-800",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    shadow: "shadow-red-200/50",
    active: true,
  },
  {
    id: "payment-history",
    label: "Payment History",
    description: "View and filter all authorized payments — AP invoices & CC expenses",
    icon: History,
    gradient: "from-slate-500 to-slate-700",
    hoverGradient: "from-slate-600 to-slate-800",
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    shadow: "shadow-slate-200/50",
    active: true,
  },
  {
    id: "yoda",
    label: "YODA Reports",
    description: "Daily sales, scorecard and operational reports powered by YODA",
    icon: Database,
    gradient: "from-emerald-500 to-emerald-700",
    hoverGradient: "from-emerald-600 to-emerald-800",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    shadow: "shadow-emerald-200/50",
    active: true,
  },
  {
    id: "lab",
    label: "Concept Lab",
    description: "Works in progress, mockups, and previews -- a shared space for ideas before they land in production",
    icon: FlaskConical,
    gradient: "from-purple-500 to-purple-700",
    hoverGradient: "from-purple-600 to-purple-800",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    shadow: "shadow-purple-200/50",
    active: true,
    externalUrl: "/lab/",
    alwaysVisible: true,
    badge: "Preview",
  },
];

/* =====================================================================
   USER ACCESS CONTROL
   Firestore doc: dashboards/user-access
   Structure: { users: { "email": { name, role, sections[], readOnly } } }
   ===================================================================== */

const SUPER_ADMIN_EMAILS = ["scott@aubuchon.com"];

const DEFAULT_ACCESS = {
  "scott@aubuchon.com": { name: "Scott Aubuchon", role: "admin", sections: ["all"], readOnly: false },
  "scott@theaubuchonfamily.com": { name: "Scott Aubuchon", role: "viewer", sections: ["yoda"], readOnly: true },
  "will@aubuchon.com": { name: "Will Aubuchon", role: "viewer", sections: ["yoda"], readOnly: true },
};

function useUserAccess() {
  const [userAccess, setUserAccess] = useState(null);   // null = loading, false = denied
  const [allUsers, setAllUsers] = useState({});
  const userEmail = (auth.currentUser?.email || "").toLowerCase();

  useEffect(() => {
    if (!userEmail) return;
    (async () => {
      try {
        const docRef = doc(db, "dashboards", "user-access");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const users = snap.data().users || {};
          setAllUsers(users);
          const me = users[userEmail];
          if (me) {
            setUserAccess(me);
          } else if (SUPER_ADMIN_EMAILS.includes(userEmail)) {
            const adminEntry = { name: "Scott Aubuchon", role: "admin", sections: ["all"], readOnly: false };
            users[userEmail] = adminEntry;
            await setDoc(docRef, { users }, { merge: true });
            setUserAccess(adminEntry);
            setAllUsers(users);
          } else {
            setUserAccess(false);
          }
        } else {
          await setDoc(docRef, { users: DEFAULT_ACCESS });
          setAllUsers(DEFAULT_ACCESS);
          setUserAccess(DEFAULT_ACCESS[userEmail] || false);
        }
      } catch (e) {
        console.error("Failed to load user access:", e);
        if (SUPER_ADMIN_EMAILS.includes(userEmail)) {
          setUserAccess({ name: "Scott Aubuchon", role: "admin", sections: ["all"], readOnly: false });
        } else {
          setUserAccess(false);
        }
      }
    })();
  }, [userEmail]);

  const isAdmin = userAccess?.role === "admin";

  const canAccessSection = useCallback((sectionId) => {
    if (!userAccess) return false;
    if (userAccess.sections?.includes("all")) return true;
    return userAccess.sections?.includes(sectionId) || false;
  }, [userAccess]);

  const refreshUsers = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, "dashboards", "user-access"));
      if (snap.exists()) {
        const users = snap.data().users || {};
        setAllUsers(users);
        setUserAccess(users[userEmail] || false);
      }
    } catch (e) { console.error(e); }
  }, [userEmail]);

  const saveAllUsers = useCallback(async (updatedUsers) => {
    // Safety: never allow removing super admin
    SUPER_ADMIN_EMAILS.forEach(email => {
      if (!updatedUsers[email]) {
        updatedUsers[email] = { name: "Scott Aubuchon", role: "admin", sections: ["all"], readOnly: false };
      }
    });
    await setDoc(doc(db, "dashboards", "user-access"), { users: updatedUsers });
    setAllUsers(updatedUsers);
    const me = updatedUsers[userEmail];
    if (me) setUserAccess(me);
  }, [userEmail]);

  return { userAccess, allUsers, isAdmin, canAccessSection, saveAllUsers, refreshUsers, userEmail };
}

/* =====================================================================
   ACCESS DENIED SCREEN
   ===================================================================== */

function AccessDeniedScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock size={28} className="text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Access Required</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your account ({auth.currentUser?.email}) doesn't have access to this dashboard yet.
          Please contact your administrator to request access.
        </p>
        <button onClick={() => signOut(auth)} className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
          Sign Out
        </button>
      </div>
    </div>
  );
}

/* =====================================================================
   ADMIN PANEL — User Access Management
   ===================================================================== */

function AdminPanel({ goHome, allUsers, saveAllUsers }) {
  const [adminTab, setAdminTab] = useState("users"); // "users" or "voting"
  const [users, setUsers] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("viewer");
  const [formSections, setFormSections] = useState([]);
  const [formReadOnly, setFormReadOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setUsers({ ...allUsers }); }, [allUsers]);

  const sectionOptions = SECTIONS.map(s => ({ id: s.id, label: s.label }));

  const resetForm = () => {
    setFormEmail(""); setFormName(""); setFormRole("viewer");
    setFormSections([]); setFormReadOnly(true);
    setShowAddForm(false); setEditingEmail(null);
  };

  const startEdit = (email) => {
    const u = users[email];
    if (!u) return;
    setEditingEmail(email);
    setFormEmail(email);
    setFormName(u.name || "");
    setFormRole(u.role || "viewer");
    setFormSections(u.sections?.includes("all") ? sectionOptions.map(s => s.id) : (u.sections || []));
    setFormReadOnly(u.readOnly !== false);
    setShowAddForm(true);
  };

  const startAdd = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleSave = async () => {
    const email = formEmail.toLowerCase().trim();
    if (!email || !email.includes("@")) return;
    setSaving(true);
    try {
      const updated = { ...users };
      const isAll = formRole === "admin" || formSections.length === sectionOptions.length;
      updated[email] = {
        name: formName.trim(),
        role: formRole,
        sections: isAll ? ["all"] : formSections,
        readOnly: formRole === "admin" ? false : formReadOnly,
      };
      await saveAllUsers(updated);
      setUsers(updated);
      resetForm();
    } catch (e) {
      console.error("Save failed:", e);
    }
    setSaving(false);
  };

  const handleDelete = async (email) => {
    if (SUPER_ADMIN_EMAILS.includes(email)) return;
    setSaving(true);
    try {
      const updated = { ...users };
      delete updated[email];
      await saveAllUsers(updated);
      setUsers(updated);
      setConfirmDelete(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const toggleSection = (sectionId) => {
    setFormSections(prev => prev.includes(sectionId) ? prev.filter(s => s !== sectionId) : [...prev, sectionId]);
  };

  const toggleAllSections = () => {
    if (formSections.length === sectionOptions.length) {
      setFormSections([]);
    } else {
      setFormSections(sectionOptions.map(s => s.id));
    }
  };

  const userEntries = Object.entries(users).sort((a, b) => {
    if (a[1].role === "admin" && b[1].role !== "admin") return -1;
    if (b[1].role === "admin" && a[1].role !== "admin") return 1;
    return a[0].localeCompare(b[0]);
  });

  const getSectionLabels = (sections) => {
    if (!sections || sections.length === 0) return "None";
    if (sections.includes("all")) return "All Sections";
    return sections.map(id => {
      const s = SECTIONS.find(sec => sec.id === id);
      return s ? s.label : id;
    }).join(", ");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={goHome} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <ArrowLeft size={18} />
              </button>
              <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Shield size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Admin Settings</h1>
                <p className="text-xs text-gray-400 mt-0.5">Manage users, access, and voting configuration</p>
              </div>
            </div>
            {adminTab === "users" && (
              <button onClick={startAdd} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                <UserPlus size={16} />
                Add User
              </button>
            )}
          </div>
          {/* Admin Tabs */}
          <div className="flex gap-1 mt-4 -mb-px">
            <button onClick={() => setAdminTab("users")} className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all ${adminTab === "users" ? "border-indigo-600 text-indigo-700 bg-indigo-50/50" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              <Users size={14} /> Users ({userEntries.length})
            </button>
            <button onClick={() => setAdminTab("voting")} className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all ${adminTab === "voting" ? "border-indigo-600 text-indigo-700 bg-indigo-50/50" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              <CircleDot size={14} /> Voting Config
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
      {adminTab === "users" && (<div>
        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl border-2 border-indigo-200 p-6 mb-8 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-4">{editingEmail ? "Edit User" : "Add New User"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                  disabled={!!editingEmail} placeholder="user@aubuchon.com"
                  className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${editingEmail ? "bg-gray-50 text-gray-400" : ""}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="First Last"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>

            {/* Role */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-2">Role</label>
              <div className="flex gap-3">
                {["admin", "viewer"].map(role => (
                  <button key={role} onClick={() => { setFormRole(role); if (role === "admin") { setFormSections(sectionOptions.map(s => s.id)); setFormReadOnly(false); } }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${formRole === role
                      ? role === "admin" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                    {role === "admin" ? "Admin" : "Viewer"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{formRole === "admin" ? "Full access to all sections + can manage users" : "Read-only access to selected sections"}</p>
            </div>

            {/* Section Access */}
            {formRole !== "admin" && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">Section Access</label>
                  <button onClick={toggleAllSections} className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium">
                    {formSections.length === sectionOptions.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {sectionOptions.map(sec => {
                    const selected = formSections.includes(sec.id);
                    const secDef = SECTIONS.find(s => s.id === sec.id);
                    return (
                      <button key={sec.id} onClick={() => toggleSection(sec.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border-2 transition-all text-left ${selected
                          ? `${secDef?.border || "border-indigo-300"} ${secDef?.bg || "bg-indigo-50"} ${secDef?.text || "text-indigo-700"} font-medium`
                          : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${selected ? "bg-indigo-600" : "bg-gray-200"}`}>
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                        {sec.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Read-Only Toggle */}
            {formRole !== "admin" && (
              <div className="mb-6">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Read-Only Mode</span>
                    <p className="text-[11px] text-gray-400 mt-0.5">User can view data but cannot make changes</p>
                  </div>
                  <button onClick={() => setFormReadOnly(!formReadOnly)}
                    className={`p-1 rounded-full transition-colors ${formReadOnly ? "text-emerald-600" : "text-gray-400"}`}>
                    {formReadOnly ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formEmail.trim()}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm">
                {saving ? "Saving..." : editingEmail ? "Update User" : "Add User"}
              </button>
            </div>
          </div>
        )}

        {/* User List */}
        <div className="space-y-3">
          {userEntries.map(([email, u]) => (
            <div key={email} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${u.role === "admin" ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}>
                    {String(u.name || email).split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900 truncate">{u.name || email}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {u.role}
                      </span>
                      {u.readOnly && u.role !== "admin" && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Read-Only</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{email}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{getSectionLabels(u.sections)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(email)} className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors" title="Edit">
                    <Edit3 size={15} />
                  </button>
                  {!SUPER_ADMIN_EMAILS.includes(email) && (
                    confirmDelete === email ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(email)} className="px-2 py-1 text-xs text-red-600 bg-red-50 rounded font-medium hover:bg-red-100">Remove</button>
                        <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 text-xs text-gray-500 rounded font-medium hover:bg-gray-100">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(email)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Remove">
                        <Trash2 size={15} />
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info Box */}
        <div className="mt-8 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
          <p className="text-xs text-indigo-700 font-medium mb-1">How access works</p>
          <p className="text-[11px] text-indigo-600 leading-relaxed">
            Users log in with their Google account. If their email is on this list, they see only the sections assigned to them.
            Admins can see everything and manage other users. Users not on this list will see an "Access Required" screen after login.
            Scott's admin access cannot be removed as a safety measure.
          </p>
        </div>
      </div>)}

      {adminTab === "voting" && (
        <VotingAdminPanelStandalone allUsers={users} />
      )}
      </div>
    </div>
  );
}

/* =====================================================================
   VOTING ADMIN (STANDALONE) — Self-contained, loads own data from Firestore
   ===================================================================== */

function VotingAdminPanelStandalone({ allUsers }) {
  const [tab, setTab] = useState("rights");
  const [votesData, setVotesData] = useState(null);
  const [projectList, setProjectList] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Load voting data and projects from Firestore
  useEffect(() => {
    (async () => {
      try {
        const [vSnap, pSnap] = await Promise.all([
          getDoc(doc(db, "dashboards", "project-votes")),
          getDoc(doc(db, "dashboards", "it-command-center")),
        ]);
        if (vSnap.exists()) {
          setVotesData(vSnap.data());
        } else {
          setVotesData({ votes: {}, config: { nonVoteable: [], voterRights: {} } });
        }
        if (pSnap.exists() && pSnap.data().projects) {
          setProjectList(pSnap.data().projects);
        }
      } catch (err) {
        console.warn("Voting admin load failed:", err);
        setVotesData({ votes: {}, config: { nonVoteable: [], voterRights: {} } });
      }
      setLoaded(true);
    })();
  }, []);

  const votingConfig = votesData?.config || { nonVoteable: [], voterRights: {} };
  const nonVoteableIds = votingConfig.nonVoteable || [];

  const saveConfig = async (updated) => {
    setVotesData(updated);
    try { await setDoc(doc(db, "dashboards", "project-votes"), updated); } catch (err) { console.warn("Voting config save failed:", err); }
  };

  const toggleVoteable = async (projectId) => {
    if (!votesData) return;
    const updated = JSON.parse(JSON.stringify(votesData));
    const list = updated.config.nonVoteable || [];
    updated.config.nonVoteable = list.includes(projectId) ? list.filter(id => id !== projectId) : [...list, projectId];
    await saveConfig(updated);
  };

  const toggleRight = async (email, sectionId, enabled) => {
    if (!votesData) return;
    const updated = JSON.parse(JSON.stringify(votesData));
    if (!updated.config.voterRights) updated.config.voterRights = {};
    const normalizedEmail = (email || "").toLowerCase();
    const current = updated.config.voterRights[normalizedEmail] || [];
    updated.config.voterRights[normalizedEmail] = enabled ? [...new Set([...current, sectionId])] : current.filter(s => s !== sectionId);
    await saveConfig(updated);
  };

  const toggleAllRights = async (email, enable) => {
    if (!votesData) return;
    const updated = JSON.parse(JSON.stringify(votesData));
    if (!updated.config.voterRights) updated.config.voterRights = {};
    const normalizedEmail = (email || "").toLowerCase();
    updated.config.voterRights[normalizedEmail] = enable ? VOTING_SECTIONS.map(s => s.id) : [];
    await saveConfig(updated);
  };

  if (!loaded) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-gray-200 border-t-indigo-500 rounded-full animate-spin" /></div>;

  const userEntries = Object.entries(allUsers || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const activeProjects = projectList.filter(p => p.status !== "Done");

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[{ id: "rights", label: "Voter Rights", icon: Users }, { id: "projects", label: "Voteable Projects", icon: ToggleRight }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-all ${tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Voter Rights */}
      {tab === "rights" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 mb-4">Grant voting rights per department. Each voter gets {DOTS_PER_SECTION} dots per section they have access to, max {MAX_DOTS_PER_PROJECT} per project.</p>
          {userEntries.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">No users configured. Add users in the Users tab first.</p>}
          {userEntries.map(([email, userData]) => {
            const rights = votingConfig.voterRights?.[email] || [];
            const allEnabled = VOTING_SECTIONS.every(s => rights.includes(s.id));
            return (
              <div key={email} className="p-4 bg-white rounded-xl border border-gray-200 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold ${userData.role === "admin" ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-gradient-to-br from-gray-600 to-gray-800"}`}>
                      {String(userData.name || email || "").split(" ").map(n => (n[0] || "").toUpperCase()).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{userData.name || email}</div>
                      <div className="text-[10px] text-gray-400">{email}</div>
                    </div>
                  </div>
                  <button onClick={() => toggleAllRights(email, !allEnabled)} className={`text-[10px] font-medium px-2.5 py-1 rounded-lg transition-all ${allEnabled ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {allEnabled ? "Remove All" : "Grant All"}
                  </button>
                </div>
                <div className="flex gap-2">
                  {VOTING_SECTIONS.map(({ id, label, text: sText, bg: sBg, border: sBorder }) => {
                    const has = rights.includes(id);
                    return (
                      <button key={id} onClick={() => toggleRight(email, id, !has)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium rounded-lg border transition-all ${has ? `${sBg} ${sText} ${sBorder}` : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"}`}>
                        {has && <Check size={10} />}{label.split("&")[0].trim()}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Voteable Projects */}
      {tab === "projects" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-4">Toggle projects on or off for voting. Non-voteable projects won't appear in the voting view.</p>
          {activeProjects.sort((a, b) => {
            const aDept = (a.departments || [])[0] || "";
            const bDept = (b.departments || [])[0] || "";
            return aDept.localeCompare(bDept) || a.name.localeCompare(b.name);
          }).map(p => {
            const isOff = nonVoteableIds.includes(p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-all">
                <button onClick={() => toggleVoteable(p.id)} className="flex-shrink-0">
                  {isOff ? <ToggleLeft size={24} className="text-gray-300" /> : <ToggleRight size={24} className="text-emerald-500" />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium block truncate ${isOff ? "text-gray-400" : "text-gray-900"}`}>{p.name}</span>
                  <span className="text-[10px] text-gray-500">{String(p.owner || "")} • {(p.departments || []).join(", ")}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${isOff ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700"}`}>
                  {isOff ? "Off" : "Voteable"}
                </span>
              </div>
            );
          })}
          {activeProjects.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">No active projects found.</p>}
        </div>
      )}
    </div>
  );
}

function HomeScreen({ onNavigate, canAccessSection, isAdmin }) {
  const [apInvoiceCount, setApInvoiceCount] = useState(null);
  const displayName = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "User";
  const visibleSections = SECTIONS.filter(s => s.alwaysVisible || canAccessSection(s.id));

  useEffect(() => {
    if (!canAccessSection("ap-invoices")) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "ap_invoices"));
        const pending = snap.docs.filter(d => (d.data().status || "pending") === "pending").length;
        setApInvoiceCount(pending);
      } catch (e) { /* silent */ }
    })();
  }, [canAccessSection]);
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-gradient-to-br from-gray-800 to-gray-950 rounded-xl flex items-center justify-center shadow-lg">
                <Home size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">{displayName}'s Workbench</h1>
                <p className="text-xs text-gray-400 mt-0.5">The Aubuchon Company</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button onClick={() => onNavigate("admin")} className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors" title="User Access Management">
                  <Settings size={16} />
                </button>
              )}
              <button onClick={() => signOut(auth)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tile Grid */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <p className="text-sm text-gray-500 mb-8 font-medium">Select a section to get started</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => { if (!section.active) return; if (section.externalUrl) { window.location.href = section.externalUrl; return; } onNavigate(section.id); }}
                className={`group relative text-left rounded-2xl border-2 p-6 transition-all duration-200
                  ${section.active
                    ? `${section.border} bg-white hover:shadow-xl hover:${section.shadow} hover:scale-[1.02] hover:border-transparent cursor-pointer`
                    : "border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60"
                  }`}
              >
                {/* Colored accent bar at top */}
                <div className={`absolute top-0 left-6 right-6 h-1 rounded-b-full bg-gradient-to-r ${section.gradient} ${section.active ? "opacity-80 group-hover:opacity-100" : "opacity-30"} transition-opacity`} />

                <div className="flex items-start gap-4 mt-2">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${section.gradient} flex items-center justify-center shadow-md flex-shrink-0 ${section.active ? "group-hover:shadow-lg group-hover:scale-105" : ""} transition-all`}>
                    <Icon size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900">{section.label}{section.id === "ap-invoices" && apInvoiceCount > 0 && ` (${apInvoiceCount})`}</h2>
                      {section.badge && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{section.badge}</span>
                      )}
                      {!section.active && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Coming Soon</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{section.description}</p>
                  </div>
                  {section.active && (
                    <ArrowRight size={18} className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all mt-1 flex-shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center py-10 text-[11px] text-gray-300 mt-8">
          The Aubuchon Company -- IT Department
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   APP SHELL  --  Routes between Home and section views
   ===================================================================== */

const APInvoiceCard = ({ inv, decision, onDecision, onClearDecision }) => {
  const [openPanel, setOpenPanel] = useState(null);
  const [category, setCategory] = useState(decision?.category || inv.category || "Expense in Budget");
  const [comment, setComment] = useState(decision?.comment || inv.comment || "");

  const togglePanel = (p) => setOpenPanel(prev => prev === p ? null : p);

  const fmt = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parseDue = (val) => {
    if (!val) return null;
    if (val && val.toDate) return val.toDate();
    if (typeof val === "string" && val.includes("/")) {
      const [m, d, y] = val.split("/");
      return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
    }
    return new Date(val);
  };

  const dueDate = parseDue(inv.paymentDue);
  const overdue = dueDate && dueDate < new Date() && inv.status === "pending";
  const dueLabel = dueDate
    ? dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : inv.paymentDue || "—";

  const handleDecision = (action) => {
    onDecision(inv.id, action, category, comment);
  };

  // Update parent when category/comment change if a decision is already set
  useEffect(() => {
    if (decision) onDecision(inv.id, decision.action, category, comment);
  }, [category, comment]);

  // Visual state: use decision (local batch) if present, otherwise use saved status
  const displayStatus = decision ? decision.action : inv.status;
  const statusColors = {
    approved: { border: "#16a34a", bg: "#f0fdf4" },
    rejected:  { border: "#dc2626", bg: "#fef2f2" },
    pending:   { border: "#e5e7eb", bg: "#ffffff" },
  };
  const sc = statusColors[displayStatus] || statusColors.pending;

  const chip = (text, color = "#6b7280", bg = "#f3f4f6") => (
    <span style={{ background: bg, color, border: `1px solid ${color}22`, padding: "3px 11px", borderRadius: 20, fontSize: ".75rem", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {text}
    </span>
  );

  const detailRow = (label, value, light = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #f3f4f6", gap: 12 }}>
      <span style={{ color: "#9ca3af", fontSize: ".78rem", flexShrink: 0 }}>{label}</span>
      <span style={{ color: light ? "#6b7280" : "#111827", fontSize: ".78rem", fontWeight: 500, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );

  return (
    <div style={{ background: sc.bg, borderRadius: 12, marginBottom: 20, overflow: "hidden", border: `1px solid ${sc.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Card header */}
      <div style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, borderBottom: "1px solid #e5e7eb" }}>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111827", letterSpacing: "-.01em" }}>{inv.vendor}</div>
          <div style={{ fontSize: ".8rem", color: "#6b7280", display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
            <span>Invoice #{inv.invoiceNumber}</span>
            <span>·</span>
            <span>Store {inv.storeNumber}{inv.location ? ` — ${inv.location}` : ""}</span>
            <span>·</span>
            <span>Vendor #{inv.vendorNumber}</span>
            {inv.docNumber && <><span>·</span><span style={{ color: "#9ca3af" }}>{inv.docNumber}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {displayStatus !== "pending" && (
            <span style={{
              fontSize: ".78rem", fontWeight: 700, padding: "4px 14px", borderRadius: 20,
              background: displayStatus === "approved" ? "#dcfce7" : displayStatus === "rejected" ? "#fee2e2" : "#f3f4f6",
              color: displayStatus === "approved" ? "#166534" : displayStatus === "rejected" ? "#991b1b" : "#4b5563",
              border: `1px solid ${displayStatus === "approved" ? "#bbf7d0" : displayStatus === "rejected" ? "#fecaca" : "#e5e7eb"}`
            }}>
              {decision && "⏳ "}
              {displayStatus === "approved" ? "✓ Approved" : displayStatus === "rejected" ? "✗ Rejected" : "Pending"}
              {decision && " (unsaved)"}
            </span>
          )}
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: overdue ? "#dc2626" : "#0f766e" }}>{fmt(inv.amount)}</div>
        </div>
      </div>

      {/* Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, padding: "10px 20px", borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
        {inv.glNumber && chip(`GL: ${inv.glNumber}`, "#4338ca", "#eef2ff")}
        {inv.projectNumber && chip(`Project: ${inv.projectNumber}`, "#0369a1", "#e0f2fe")}
        {chip(
          `Due: ${dueLabel}${overdue ? " — OVERDUE ⚠" : ""}`,
          overdue ? "#dc2626" : "#374151",
          overdue ? "#fef2f2" : "#f9fafb"
        )}
        {inv.paymentTerms && chip(inv.paymentTerms, "#374151", "#f3f4f6")}
        {chip(category, "#15803d", "#f0fdf4")}
        {chip(inv.invoiceType || "Non-Utility", "#1d4ed8", "#eff6ff")}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, padding: "10px 20px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap", background: "#fff" }}>
        {["preview", "details"].map(panel => {
          const isOpen = openPanel === panel;
          return (
            <button key={panel} onClick={() => togglePanel(panel)} style={{
              background: isOpen ? "#0f766e" : "#f3f4f6",
              color: isOpen ? "#fff" : "#374151",
              border: `1px solid ${isOpen ? "#0f766e" : "#e5e7eb"}`,
              padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: ".82rem", fontWeight: 500,
              transition: "all .15s"
            }}>
              {panel === "preview" ? "📄 View Invoice" : "🔍 Full Details"}
            </button>
          );
        })}
        {inv.jiffyUrl && (
          <a href={inv.jiffyUrl} target="_blank" rel="noopener noreferrer"
            style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", padding: "7px 14px", borderRadius: 6, fontSize: ".82rem", fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
            🔗 Open in Jiffy
          </a>
        )}
      </div>

      {/* Invoice Preview panel */}
      {openPanel === "preview" && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", background: "#f8fafc" }}>
          <div style={{ background: "#fff", color: "#333", borderRadius: 8, padding: 16, maxWidth: 720, margin: "0 auto", border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "2px solid #111" }}>
              <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{inv.vendor}</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: ".85rem" }}>Invoice #{inv.invoiceNumber}</div>
                <div style={{ fontSize: ".78rem", color: "#666" }}>{inv.invoiceDate}</div>
              </div>
            </div>
            <img
              src={`/invoices/${inv.invoiceNumber}.png`}
              alt={`Invoice ${inv.invoiceNumber} - Page 1`}
              style={{ width: "100%", borderRadius: 6, border: "1px solid #e5e7eb", marginBottom: 4 }}
              onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.querySelector('[data-fallback]').style.display = 'block'; }}
            />
            {[2,3,4].map(p => (
              <img
                key={p}
                src={`/invoices/${inv.invoiceNumber}_p${p}.png`}
                alt={`Invoice ${inv.invoiceNumber} - Page ${p}`}
                style={{ width: "100%", borderRadius: 6, border: "1px solid #e5e7eb", marginBottom: 4 }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ))}
            <div data-fallback style={{ display: "none", fontSize: ".8rem", color: "#999", textAlign: "center", fontStyle: "italic", marginBottom: 12 }}>
              Invoice image not available — use "Open in Jiffy" to view original
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", background: "#f5f5f5", padding: 10, borderRadius: 4, marginBottom: 14 }}>
              <div><div style={{ fontSize: ".68rem", textTransform: "uppercase", color: "#888" }}>Amount Due</div><strong>{fmt(inv.amount)}</strong></div>
              <div><div style={{ fontSize: ".68rem", textTransform: "uppercase", color: "#888" }}>Due Date</div><strong>{dueLabel}</strong></div>
              <div><div style={{ fontSize: ".68rem", textTransform: "uppercase", color: "#888" }}>Store</div><strong>#{inv.storeNumber}</strong></div>
              {inv.paymentTerms && <div><div style={{ fontSize: ".68rem", textTransform: "uppercase", color: "#888" }}>Terms</div><strong>{inv.paymentTerms}</strong></div>}
            </div>
            <button
              onClick={() => setOpenPanel(null)}
              style={{ display: "block", width: "100%", background: "#374151", color: "#fff", padding: "12px 0", borderRadius: 8, fontSize: ".9rem", fontWeight: 600, border: "none", cursor: "pointer" }}>
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* Full details panel */}
      {openPanel === "details" && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", background: "#f8fafc" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>

            {/* Approval Routing */}
            <div style={{ background: "#fff", borderRadius: 8, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ color: "#0f766e", fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, fontWeight: 700 }}>Approval Routing</div>
              {detailRow("Current Approver", inv.currentApprover)}
              {detailRow("Assigned To", inv.assignedTo)}
              {detailRow("VP", inv.vp)}
            </div>

            {/* Invoice Info */}
            <div style={{ background: "#fff", borderRadius: 8, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ color: "#0f766e", fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, fontWeight: 700 }}>Invoice Details</div>
              {detailRow("Invoice #", inv.invoiceNumber)}
              {detailRow("Invoice Date", inv.invoiceDate)}
              {detailRow("GL Code", inv.glNumber)}
              {detailRow("Project #", inv.projectNumber || "—")}
            </div>

            {/* Payment Info */}
            <div style={{ background: "#fff", borderRadius: 8, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ color: "#0f766e", fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, fontWeight: 700 }}>Payment Info</div>
              {detailRow("Amount Due", fmt(inv.amount))}
              {detailRow("Payment Due", dueLabel)}
              {detailRow("Terms", inv.paymentTerms)}
              {detailRow("Vendor #", inv.vendorNumber)}
            </div>

            {/* Store & Remit */}
            <div style={{ background: "#fff", borderRadius: 8, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ color: "#0f766e", fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, fontWeight: 700 }}>Store & Remit</div>
              {detailRow("Store #", inv.storeNumber)}
              {detailRow("Location", inv.location)}
              {inv.remitAddress && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: "#9ca3af", fontSize: ".73rem", marginBottom: 4 }}>Remit Address</div>
                  <div style={{ fontSize: ".78rem", color: "#374151", lineHeight: 1.5 }}>
                    {inv.remitAddress.split("|").map((s, i) => <div key={i}>{s.trim()}</div>)}
                  </div>
                </div>
              )}
            </div>

            {/* Remarks */}
            {inv.remarks && (
              <div style={{ background: "#fff", borderRadius: 8, padding: 14, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }}>
                <div style={{ color: "#0f766e", fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Remarks</div>
                <div style={{ fontSize: ".84rem", color: "#374151", lineHeight: 1.6 }}>{inv.remarks}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {inv.description && (
        <div style={{ padding: "10px 20px", fontSize: ".85rem", color: "#6b7280", borderBottom: "1px solid #f3f4f6", lineHeight: 1.6, background: "#fff" }}>
          {inv.description}
        </div>
      )}

      {/* Controls — only show for pending invoices (not yet saved to Firestore) */}
      {inv.status === "pending" && (
        <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: decision ? (decision.action === "approved" ? "#f0fdf4" : decision.action === "rejected" ? "#fef2f2" : "#f9fafb") : "#fafafa", borderTop: "1px solid #f3f4f6" }}>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "7px 10px", borderRadius: 6, fontSize: ".83rem" }}
          >
            <option>Expense in Budget</option>
            <option>Expense Not in Budget</option>
            <option>Capital In Budget</option>
            <option>Capital Not in Budget</option>
            <option>Capital Contingency In Budget</option>
            <option>Trade Invoice</option>
            <option>Rejected</option>
          </select>
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add comment (optional)"
            style={{ background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "7px 10px", borderRadius: 6, fontSize: ".83rem", flex: 1, minWidth: 180 }}
          />
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={() => handleDecision("approved")}
              style={{ background: decision?.action === "approved" ? "#0f5132" : "#166534", color: "#fff", border: decision?.action === "approved" ? "2px solid #16a34a" : "none", padding: "9px 20px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
              ✓ Approve
            </button>
            <button onClick={() => handleDecision("rejected")}
              style={{ background: decision?.action === "rejected" ? "#7f1d1d" : "#991b1b", color: "#fff", border: decision?.action === "rejected" ? "2px solid #dc2626" : "none", padding: "9px 20px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
              ✗ Reject
            </button>
            {decision && (
              <button onClick={() => onClearDecision(inv.id)}
                style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca", padding: "9px 14px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
                ↩ Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const APInvoices = ({ goHome, goHistory }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [decisions, setDecisions] = useState({});  // { [invoiceId]: { action, category, comment } }
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, "ap_invoices"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(inv => inv.jiffyAction !== "submitted"));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Local-only — updates batch decisions state (nothing saved to Firestore yet)
  const handleDecision = (invoiceId, action, category, comment) => {
    setDecisions(prev => ({ ...prev, [invoiceId]: { action, category, comment } }));
  };

  const clearDecision = (invoiceId) => {
    setDecisions(prev => { const next = { ...prev }; delete next[invoiceId]; return next; });
  };

  // Batch submit — writes ALL decisions to Firestore and queues for Jiffy
  const submitAll = async () => {
    const entries = Object.entries(decisions);
    if (entries.length === 0) return;
    setSubmitting(true);
    try {
      for (const [invoiceId, { action, category, comment }] of entries) {
        const inv = invoices.find(i => i.id === invoiceId) || {};
        const now = serverTimestamp();
        // Update the live invoice record
        await updateDoc(doc(db, "ap_invoices", invoiceId), {
          status: action, category, comment,
          actionedAt: now,
          actionedBy: "scott@aubuchon.com",
          jiffyAction: "pending",
          jiffyGroup: category || "Expense in Budget",
        });
        // Write a permanent history record — this is the audit trail
        await addDoc(collection(db, "ap_payment_history"), {
          invoiceId,
          invoiceNumber: inv.invoiceNumber || invoiceId,
          vendor: inv.vendor || "—",
          amount: Number(inv.amount || 0),
          storeNumber: inv.storeNumber || "",
          location: inv.location || "",
          glNumber: inv.glNumber || "",
          projectNumber: inv.projectNumber || "",
          paymentDue: inv.paymentDue || "",
          invoiceDate: inv.invoiceDate || "",
          description: inv.description || inv.remarks || "",
          invoiceGroup: category || inv.invoiceGroup || "—",
          status: action,
          comment: comment || "",
          actionedAt: now,
          actionedBy: "scott@aubuchon.com",
          type: "AP",
        });
      }
      setInvoices(prev => prev.map(inv => {
        const d = decisions[inv.id];
        return d ? { ...inv, status: d.action, category: d.category, comment: d.comment, jiffyAction: "pending" } : inv;
      }));
      setDecisions({});
      alert(`Submitted ${entries.length} invoice${entries.length !== 1 ? "s" : ""} — queued for Jiffy approval.`);
    } catch (e) {
      alert("Error submitting invoices: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };
  
  const fmt = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pendingInvoices = invoices.filter(i => i.status === "pending");
  const pendingTotal = pendingInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);

  const parseDue = (val) => {
    if (!val) return null;
    if (val && val.toDate) return val.toDate();
    if (typeof val === "string" && val.includes("/")) {
      const [m, d, y] = val.split("/");
      return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
    }
    return new Date(val);
  };
  const overdueCount = pendingInvoices.filter(i => { const d = parseDue(i.paymentDue); return d && d < new Date(); }).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", color: "#111827", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Sticky header */}
      <div style={{ background: "#fff", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={goHome} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem", fontWeight: 500 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
          <div>
            <h1 style={{ fontSize: "1.15rem", color: "#111827", margin: 0, fontWeight: 700 }}>AP Invoice Approval</h1>
            <div style={{ fontSize: ".73rem", color: "#6b7280" }}>Aubuchon Hardware — Accounts Payable</div>
          </div>
          {goHistory && (
            <>
              <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
              <button onClick={goHistory} style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer", color: "#374151", display: "flex", alignItems: "center", gap: 6, fontSize: ".82rem", fontWeight: 600, padding: "7px 14px", borderRadius: 8 }}>
                <History size={14} /> Payment History
              </button>
            </>
          )}
          
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {[
            ["Invoices", invoices.length, "#374151"],
            ["Pending Total", fmt(pendingTotal), "#0f766e"],
            ["Need Action", `${pendingInvoices.length}`, overdueCount > 0 ? "#dc2626" : "#374151"]
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: ".7rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em" }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        {loading && <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>Loading invoices…</div>}
        {error && <div style={{ textAlign: "center", padding: "60px 0", color: "#dc2626" }}>Error: {error}</div>}

        {!loading && overdueCount > 0 && (
          <div style={{ background: "linear-gradient(90deg,#fef2f2,#fff5f5)", border: "1px solid #fecaca", color: "#991b1b", padding: "12px 20px", borderRadius: 10, marginBottom: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.2rem" }}>⚠</span>
            <span>OVERDUE: {overdueCount} invoice{overdueCount !== 1 ? "s are" : " is"} past due — immediate action recommended.</span>
          </div>
        )}

        {!loading && invoices.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>No invoices found in the queue.</div>
        )}

        {invoices.map(inv => (
          <APInvoiceCard key={inv.id} inv={inv} decision={decisions[inv.id]} onDecision={handleDecision} onClearDecision={clearDecision} />
        ))}

        {/* Spacer so sticky bar doesn't cover last card */}
        {Object.keys(decisions).length > 0 && <div style={{ height: 100 }} />}
      </div>

      {/* Sticky Submit All bar */}
      {Object.keys(decisions).length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "linear-gradient(135deg, #0f766e 0%, #065f46 100%)",
          padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.15)", borderTop: "2px solid #10b981"
        }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>
              {Object.keys(decisions).length} invoice{Object.keys(decisions).length !== 1 ? "s" : ""} ready to submit
            </div>
            <div style={{ fontSize: ".78rem", opacity: .85 }}>
              {Object.values(decisions).filter(d => d.action === "approved").length} approved
              {" · "}
              {Object.values(decisions).filter(d => d.action === "rejected").length} rejected
              {" · "}
              Total: {fmt(Object.entries(decisions).reduce((sum, [id, d]) => {
                const inv = invoices.find(i => i.id === id);
                return sum + (Number(inv?.amount || 0));
              }, 0))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setDecisions({})}
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", padding: "10px 22px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: ".88rem" }}>
              Clear All
            </button>
            <button onClick={submitAll} disabled={submitting}
              style={{ background: "#fff", color: "#065f46", border: "none", padding: "10px 30px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: ".92rem", opacity: submitting ? .6 : 1, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              {submitting ? "Submitting…" : `Submit All (${Object.keys(decisions).length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const CC_CATEGORIES = [
  "Business Meals & Entertainment",
  "Travel & Lodging",
  "Office Supplies",
  "IT Equipment",
  "IT Software / Subscriptions",
  "Marketing & Advertising",
  "Training & Education",
  "Utilities",
  "Shipping & Freight",
  "Maintenance & Repairs",
  "Other Business Expense",
];

const WellsCCCard = ({ txn, decision, onDecision, onClearDecision }) => {
  const [category, setCategory] = useState(decision?.category || txn.category || "Other Business Expense");
  const [glCode, setGlCode] = useState(decision?.glCode || txn.glCode || "");
  const [notes, setNotes] = useState(decision?.notes || txn.notes || "");
  const [receiptSubmitted, setReceiptSubmitted] = useState(decision?.receiptSubmitted ?? txn.receiptSubmitted ?? false);
  const [receiptUrl, setReceiptUrl] = useState(txn.receiptUrl || "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleReceiptUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const ext = file.name.split(".").pop();
      const path = `cc_receipts/${txn.id}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      // Save URL immediately to Firestore so it persists regardless of review state
      await updateDoc(doc(db, "cc_expenses", txn.id), { receiptUrl: url });
      setReceiptUrl(url);
    } catch (err) {
      setUploadError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const displayStatus = decision ? decision.status : (txn.status || "pending");

  const fmt = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (val) => {
    if (!val) return "--";
    if (val && val.toDate) return val.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (typeof val === "string") return val;
    return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleReview = () => {
    onDecision(txn.id, { status: "reviewed", category, glCode, notes, receiptSubmitted });
  };

  useEffect(() => {
    if (decision) onDecision(txn.id, { status: decision.status, category, glCode, notes, receiptSubmitted });
  }, [category, glCode, notes, receiptSubmitted]);

  const cardStyle = {
    background: displayStatus === "reviewed" ? "#f0fdf4" : "#fff",
    borderRadius: 12,
    marginBottom: 18,
    overflow: "hidden",
    border: `1px solid ${displayStatus === "reviewed" ? "#86efac" : "#e5e7eb"}`,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, borderBottom: "1px solid #f3e8ff" }}>
        <div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#111827" }}>{txn.merchant}</div>
          <div style={{ fontSize: ".78rem", color: "#6b7280", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 3 }}>
            <span>{fmtDate(txn.transactionDate)}</span>
            {txn.cardHolder && <><span>&middot;</span><span>{txn.cardHolder}</span></>}
            {txn.cardLast4 && <><span>&middot;</span><span>Card ending {txn.cardLast4}</span></>}
            {txn.postDate && <><span>&middot;</span><span style={{ color: "#9ca3af" }}>Posted: {fmtDate(txn.postDate)}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {displayStatus === "reviewed" && (
            <span style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", fontSize: ".78rem", fontWeight: 700, padding: "4px 12px", borderRadius: 20 }}>
              {decision ? "~ Reviewed (unsaved)" : "Reviewed"}
            </span>
          )}
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#be185d" }}>{fmt(txn.amount)}</div>
        </div>
      </div>

      {/* Already-reviewed summary row */}
      {txn.status === "reviewed" && !decision && (
        <div style={{ padding: "10px 20px", fontSize: ".8rem", color: "#6b7280", background: "#f0fdf4", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {txn.category && <span><strong>Category:</strong> {txn.category}</span>}
          {txn.glCode && <span><strong>GL:</strong> {txn.glCode}</span>}
          {txn.notes && <span><strong>Notes:</strong> {txn.notes}</span>}
          {receiptUrl
            ? <a href={receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", fontWeight: 600, textDecoration: "none" }}>📄 View Receipt</a>
            : <span style={{ color: txn.receiptSubmitted ? "#15803d" : "#9ca3af", fontWeight: 600 }}>
                {txn.receiptSubmitted ? "Receipt on file (WF)" : "No receipt"}
              </span>
          }
        </div>
      )}

      {/* Classification controls -- show for pending OR when editing a reviewed txn */}
      {(txn.status !== "reviewed" || decision) && (
        <div style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: displayStatus === "reviewed" ? "#f0fdf4" : "#fafafa", borderTop: "1px solid #f3f4f6" }}>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "7px 10px", borderRadius: 6, fontSize: ".83rem" }}
          >
            {CC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="text"
            value={glCode}
            onChange={e => setGlCode(e.target.value)}
            placeholder="GL Code..."
            style={{ background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "7px 10px", borderRadius: 6, fontSize: ".83rem", width: 120 }}
          />
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes / purpose (optional)"
            style={{ background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "7px 10px", borderRadius: 6, fontSize: ".83rem", flex: 1, minWidth: 160 }}
          />
          {/* Receipt upload */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {receiptUrl
              ? <a href={receiptUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#1d4ed8", fontSize: ".8rem", fontWeight: 600, textDecoration: "none", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "5px 10px", borderRadius: 6, whiteSpace: "nowrap" }}>
                  📄 View Receipt
                </a>
              : null}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
              background: uploading ? "#f3f4f6" : "#f8fafc", border: "1px solid #d1d5db",
              borderRadius: 6, padding: "5px 10px", fontSize: ".8rem", color: "#374151", fontWeight: 500, whiteSpace: "nowrap" }}>
              <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleReceiptUpload} disabled={uploading} />
              {uploading ? "⏳ Uploading..." : receiptUrl ? "🔄 Replace" : "📎 Attach Receipt"}
            </label>
            {uploadError && <span style={{ color: "#dc2626", fontSize: ".75rem" }}>{uploadError}</span>}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".83rem", color: "#374151", cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={receiptSubmitted} onChange={e => setReceiptSubmitted(e.target.checked)} />
            Submitted to WF
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={handleReview}
              style={{ background: decision?.status === "reviewed" ? "#15803d" : "#166534", color: "#fff", border: decision?.status === "reviewed" ? "2px solid #22c55e" : "none", padding: "9px 20px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
              Mark Reviewed
            </button>
            {decision && (
              <button onClick={() => onClearDecision(txn.id)}
                style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca", padding: "9px 14px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const WellsCC = ({ goHome, goHistory }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, "cc_expenses"), orderBy("transactionDate", "desc"));
        const snap = await getDocs(q);
        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDecision = (txnId, data) => {
    setDecisions(prev => ({ ...prev, [txnId]: data }));
  };

  const clearDecision = (txnId) => {
    setDecisions(prev => { const next = { ...prev }; delete next[txnId]; return next; });
  };

  const submitAll = async () => {
    const entries = Object.entries(decisions);
    if (entries.length === 0) return;
    setSubmitting(true);
    try {
      for (const [txnId, data] of entries) {
        await updateDoc(doc(db, "cc_expenses", txnId), {
          status: "reviewed",
          category: data.category,
          glCode: data.glCode || "",
          notes: data.notes || "",
          receiptSubmitted: data.receiptSubmitted || false,
          reviewedAt: serverTimestamp(),
          reviewedBy: "scott@aubuchon.com",
        });
      }
      setTransactions(prev => prev.map(t => {
        const d = decisions[t.id];
        return d ? { ...t, status: "reviewed", category: d.category, glCode: d.glCode, notes: d.notes, receiptSubmitted: d.receiptSubmitted } : t;
      }));
      setDecisions({});
      alert(`Saved ${entries.length} transaction${entries.length !== 1 ? "s" : ""} as reviewed.`);
    } catch (e) {
      alert("Error saving: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pendingTxns = transactions.filter(t => (t.status || "pending") !== "reviewed");
  const reviewedTxns = transactions.filter(t => t.status === "reviewed");
  const displayTxns = filter === "all" ? transactions : filter === "reviewed" ? reviewedTxns : pendingTxns;
  const pendingTotal = pendingTxns.reduce((s, t) => s + Number(t.amount || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", color: "#111827", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Sticky header */}
      <div style={{ background: "#fff", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={goHome} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem", fontWeight: 500 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
          <div>
            <h1 style={{ fontSize: "1.15rem", color: "#111827", margin: 0, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <CreditCard size={18} /> Wells Fargo CC
            </h1>
            <div style={{ fontSize: ".73rem", color: "#6b7280" }}>Corporate Credit Card -- Review & Classify</div>
          </div>
          {goHistory && (
            <>
              <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
              <button onClick={goHistory} style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", cursor: "pointer", color: "#374151", display: "flex", alignItems: "center", gap: 6, fontSize: ".82rem", fontWeight: 600, padding: "7px 14px", borderRadius: 8 }}>
                <History size={14} /> Payment History
              </button>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {[
            ["Transactions", transactions.length, "#374151"],
            ["Pending Total", fmt(pendingTotal), "#be185d"],
            ["Need Review", pendingTxns.length, pendingTxns.length > 0 ? "#dc2626" : "#16a34a"],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: ".7rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em" }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            ["pending", `Needs Review (${pendingTxns.length})`],
            ["reviewed", `Reviewed (${reviewedTxns.length})`],
            ["all", `All (${transactions.length})`],
          ].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ background: filter === val ? "#be185d" : "#fff", color: filter === val ? "#fff" : "#374151", border: `1px solid ${filter === val ? "#be185d" : "#e5e7eb"}`, padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: ".83rem", fontWeight: 600, transition: "all .15s" }}>
              {label}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>Loading transactions...</div>}
        {error && <div style={{ textAlign: "center", padding: "60px 0", color: "#dc2626" }}>Error: {error}</div>}

        {!loading && transactions.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#6b7280" }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: .3 }}>CC</div>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: "1.05rem" }}>No transactions loaded yet</div>
            <div style={{ fontSize: ".85rem", maxWidth: 340, margin: "0 auto", lineHeight: 1.6 }}>
              Transactions will appear here once imported from the Wells Fargo portal.
            </div>
          </div>
        )}

        {!loading && displayTxns.length === 0 && transactions.length > 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: ".9rem" }}>
            No transactions in this view.
          </div>
        )}

        {displayTxns.map(txn => (
          <WellsCCCard
            key={txn.id}
            txn={txn}
            decision={decisions[txn.id]}
            onDecision={handleDecision}
            onClearDecision={clearDecision}
          />
        ))}

        {Object.keys(decisions).length > 0 && <div style={{ height: 100 }} />}
      </div>

      {/* Sticky save bar */}
      {Object.keys(decisions).length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "linear-gradient(135deg, #be185d 0%, #9d174d 100%)",
          padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.15)", borderTop: "2px solid #ec4899",
        }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>
              {Object.keys(decisions).length} transaction{Object.keys(decisions).length !== 1 ? "s" : ""} ready to save
            </div>
            <div style={{ fontSize: ".78rem", opacity: .85 }}>
              Total: {fmt(Object.entries(decisions).reduce((sum, [id]) => {
                const txn = transactions.find(t => t.id === id);
                return sum + Number(String(txn?.amount || 0));
              }, 0))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setDecisions({})}
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", padding: "10px 22px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: ".88rem" }}>
              Clear All
            </button>
            <button onClick={submitAll} disabled={submitting}
              style={{ background: "#fff", color: "#9d174d", border: "none", padding: "10px 30px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: ".92rem", opacity: submitting ? .6 : 1, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              {submitting ? "Saving..." : `Save All (${Object.keys(decisions).length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


/* ReceiptCell: handles upload + view for a single CC row in Payment History */
const ReceiptCell = ({ row }) => {
  const [url, setUrl] = useState(row.receiptUrl || "");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `cc_receipts/${row.id}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "cc_expenses", row.id), { receiptUrl: downloadUrl });
      setUrl(downloadUrl);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (url) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ color: "#1d4ed8", fontSize: ".75rem", fontWeight: 600, textDecoration: "none",
            background: "#eff6ff", border: "1px solid #bfdbfe", padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap" }}>
          📄 View
        </a>
        <label style={{ cursor: "pointer", fontSize: ".68rem", color: "#9ca3af" }}>
          <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
          replace
        </label>
      </div>
    );
  }
  return (
    <label style={{ cursor: uploading ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 4,
      background: "#f8fafc", border: "1px dashed #d1d5db", borderRadius: 5,
      padding: "3px 8px", fontSize: ".72rem", color: uploading ? "#9ca3af" : "#6b7280", whiteSpace: "nowrap" }}>
      <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
      {uploading ? "⏳…" : "📎 Upload"}
    </label>
  );
};

/* =====================================================================
   PAYMENT HISTORY  --  Unified view of all authorized payments (AP + CC)
   ===================================================================== */

const PaymentHistory = ({ goHome, goBack }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState("All");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterStore, setFilterStore] = useState("");
  const [filterGL, setFilterGL] = useState("");
  const [filterGroup, setFilterGroup] = useState("All");
  const [sortCol, setSortCol] = useState("actioned");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    (async () => {
      try {
        // Load permanent AP payment history (written on every approve/reject submit)
        const apSnap = await getDocs(query(collection(db, "ap_payment_history"), orderBy("actionedAt", "desc")));
        const apRows = apSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type || "AP",
            vendor: data.vendor || "—",
            amount: Number(data.amount || 0),
            store: data.storeNumber || "",
            location: data.location || "",
            gl: data.glNumber || "",
            project: data.projectNumber || "",
            dueDate: data.paymentDue || "",
            invoiceDate: data.invoiceDate || "",
            status: data.status || "pending",
            description: data.description || "",
            group: data.invoiceGroup || "—",
            invoiceNumber: data.invoiceNumber || "",
            actionedAt: data.actionedAt || null,
            actionedBy: data.actionedBy || "",
            comment: data.comment || "",
            receiptSubmitted: null,  // AP receipts accessed via invoice image link
          };
        });

                // Load CC expenses
        const ccSnap = await getDocs(collection(db, "cc_expenses"));
        const ccRows = ccSnap.docs.map(d => {
          const data = d.data();
          const fmtTs = (val) => {
            if (!val) return "";
            if (val.toDate) return val.toDate().toLocaleDateString("en-US");
            return String(val);
          };
          return {
            id: d.id,
            type: "CC",
            vendor: data.merchant || "--",
            amount: Number(data.amount || 0),
            store: "",
            location: data.cardHolder || "",
            gl: data.glCode || "",
            project: "",
            dueDate: fmtTs(data.transactionDate),
            invoiceDate: fmtTs(data.transactionDate),
            // Status logic: "reviewed" or "approved" from WellsCC = approved.
            // Records from bulk import have a real category set but status=null — treat as approved.
            // Records with NO date AND NO category are raw/duplicate import artifacts — excluded below.
            status: (data.status === "reviewed" || data.status === "approved")
              ? "approved"
              : (data.category && data.category !== "--")
                ? "approved"
                : (data.status || "pending"),
            description: data.notes || "",
            group: data.category || "--",
            invoiceNumber: data.cardLast4 ? `Card ...${data.cardLast4}` : "",
            receiptSubmitted: data.receiptSubmitted || false,
            receiptUrl: data.receiptUrl || "",
            actionedAt: data.reviewedAt || null,
          };
        });

        // Remove raw/empty records (no date AND no meaningful category) — these are import artifacts
        const ccCleaned = ccRows.filter(r => r.dueDate || (r.group && r.group !== "--"));
        // Deduplicate remaining rows by vendor+amount+date
        const ccSeen = new Set();
        const ccRowsDeduped = ccCleaned.filter(r => {
          const key = `${r.vendor}|${r.amount}|${r.dueDate}`;
          if (ccSeen.has(key)) return false;
          ccSeen.add(key);
          return true;
        });

        setRows([...apRows, ...ccRowsDeduped]);
      } catch (e) {
        console.error("PaymentHistory load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fmt = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parseDateStr = (val) => {
    if (!val) return null;
    if (val.toDate) return val.toDate();
    if (typeof val === "string" && val.includes("/")) {
      const [m, d, y] = val.split("/");
      return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
    }
    return new Date(val);
  };

  const fmtDate = (val) => {
    const d = parseDateStr(val);
    return d && !isNaN(d) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : (val || "—");
  };

  // Unique values for filter dropdowns
  const uniqueGroups = [...new Set(rows.map(r => r.group).filter(Boolean))].sort();

  // Apply filters
  const filtered = rows.filter(r => {
    if (filterType !== "All" && r.type !== filterType) return false;
    if (filterStatus !== "All" && r.status !== filterStatus) return false;
    if (filterVendor && !r.vendor.toLowerCase().includes(filterVendor.toLowerCase())) return false;
    if (filterStore && !r.store.includes(filterStore) && !r.location.toLowerCase().includes(filterStore.toLowerCase())) return false;
    if (filterGL && !r.gl.includes(filterGL)) return false;
    if (filterGroup !== "All" && r.group !== filterGroup) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let aVal, bVal;
    switch (sortCol) {
      case "vendor": aVal = a.vendor; bVal = b.vendor; break;
      case "amount": aVal = a.amount; bVal = b.amount; break;
      case "store": aVal = a.store; bVal = b.store; break;
      case "status": aVal = a.status; bVal = b.status; break;
      case "type": aVal = a.type; bVal = b.type; break;
      case "gl": aVal = a.gl; bVal = b.gl; break;
      case "group": aVal = a.group; bVal = b.group; break;
      case "actioned":
        aVal = parseDateStr(a.actionedAt) || new Date(0);
        bVal = parseDateStr(b.actionedAt) || new Date(0);
        break;
      default: // date
        aVal = parseDateStr(a.dueDate) || new Date(0);
        bVal = parseDateStr(b.dueDate) || new Date(0);
    }
    if (typeof aVal === "string") { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase(); }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // Totals
  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);
  const approvedTotal = filtered.filter(r => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  const pendingTotal = filtered.filter(r => r.status === "pending").reduce((s, r) => s + r.amount, 0);
  const rejectedTotal = filtered.filter(r => r.status === "rejected").reduce((s, r) => s + r.amount, 0);

  const statusBadge = (status) => {
    const cfg = {
      approved: { bg: "#dcfce7", color: "#166534", border: "#bbf7d0", label: "Approved" },
      rejected: { bg: "#fee2e2", color: "#991b1b", border: "#fecaca", label: "Rejected" },
      ignored:  { bg: "#f3f4f6", color: "#4b5563", border: "#e5e7eb", label: "Ignored" },
      pending:  { bg: "#fef3c7", color: "#92400e", border: "#fde68a", label: "Pending" },
    };
    const c = cfg[status] || cfg.pending;
    return <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, padding: "2px 10px", borderRadius: 12, fontSize: ".72rem", fontWeight: 600 }}>{c.label}</span>;
  };

  const typeBadge = (type) => {
    const cfg = {
      AP: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
      CC: { bg: "#fdf2f8", color: "#be185d", border: "#fbcfe8" },
    };
    const c = cfg[type] || cfg.AP;
    return <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, padding: "2px 8px", borderRadius: 10, fontSize: ".7rem", fontWeight: 700 }}>{type}</span>;
  };

  const sortIcon = (col) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const selectStyle = { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: ".8rem", background: "#fff", color: "#374151", minWidth: 90 };
  const inputStyle = { ...selectStyle, minWidth: 100 };

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", color: "#111827", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Sticky header */}
      <div style={{ background: "#fff", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={goBack || goHome} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem", fontWeight: 500 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
          <div>
            <h1 style={{ fontSize: "1.15rem", color: "#111827", margin: 0, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <History size={18} /> Payment History
            </h1>
            <div style={{ fontSize: ".73rem", color: "#6b7280" }}>All authorized payments — AP Invoices & CC Expenses</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {[
            ["Records", filtered.length, "#374151"],
            ["Total", fmt(totalAmount), "#0f766e"],
            ["Approved", fmt(approvedTotal), "#16a34a"],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: ".68rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em" }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>

        {/* Filters */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: ".75rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 4 }}>Filters:</div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
            <option value="All">All Types</option>
            <option value="AP">AP Invoice</option>
            <option value="CC">CC Expense</option>
          </select>
          <input placeholder="Vendor..." value={filterVendor} onChange={e => setFilterVendor(e.target.value)} style={inputStyle} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
            <option value="All">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="ignored">Ignored</option>
          </select>
          <input placeholder="Store #..." value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ ...inputStyle, minWidth: 80 }} />
          <input placeholder="GL #..." value={filterGL} onChange={e => setFilterGL(e.target.value)} style={{ ...inputStyle, minWidth: 80 }} />
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={selectStyle}>
            <option value="All">All Groups</option>
            {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {(filterVendor || filterStore || filterGL || filterType !== "All" || filterStatus !== "All" || filterGroup !== "All") && (
            <button onClick={() => { setFilterType("All"); setFilterVendor(""); setFilterStatus("All"); setFilterStore(""); setFilterGL(""); setFilterGroup("All"); }}
              style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 12px", fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>

        {loading && <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>Loading payment history…</div>}

        {!loading && (
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                    {[
                      { key: "type", label: "Type", w: 60 },
                      { key: "vendor", label: "Vendor", w: 160 },
                      { key: "amount", label: "Amount", w: 100 },
                      { key: "store", label: "Store", w: 70 },
                      { key: "date", label: "Due Date", w: 100 },
                      { key: "actioned", label: "Actioned On", w: 110 },
                      { key: "status", label: "Decision", w: 90 },
                      { key: "group", label: "Category", w: 130 },
                      { key: "desc", label: "Description", w: 180 },
                      { key: "receipt", label: "Receipt", w: 80 },
                      { key: "comment", label: "Comment", w: 180 },
                    ].map(col => (
                      <th key={col.key}
                        onClick={() => toggleSort(col.key)}
                        style={{ padding: "10px 12px", textAlign: col.key === "amount" ? "right" : "left", fontWeight: 700, color: "#374151", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".04em", minWidth: col.w }}>
                        {col.label}{sortIcon(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 && (
                    <tr><td colSpan={11} style={{ textAlign: "center", padding: "50px 0", color: "#9ca3af" }}>
                      {rows.length === 0
                        ? "No history yet — records appear here after you submit approvals or rejections."
                        : "No records match the current filters."}
                    </td></tr>
                  )}
                  {sorted.map((r, idx) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px" }}>{typeBadge(r.type)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>
                        <div>{r.vendor}</div>
                        {r.invoiceNumber && <div style={{ fontSize: ".72rem", color: "#9ca3af", fontWeight: 400 }}>#{r.invoiceNumber}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#0f766e", fontVariantNumeric: "tabular-nums" }}>{fmt(r.amount)}</td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{r.store ? `#${r.store}` : "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap" }}>{fmtDate(r.dueDate)}</td>
                      <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap", fontSize: ".78rem" }}>{fmtDate(r.actionedAt)}</td>
                      <td style={{ padding: "10px 12px" }}>{statusBadge(r.status)}</td>
                      <td style={{ padding: "10px 12px", color: "#374151", fontSize: ".78rem" }}>{r.group || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: ".78rem" }}>{r.description || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {r.type === "AP" && r.invoiceNumber
                          ? <a href={`/invoices/${r.invoiceNumber}.png`} target="_blank" rel="noopener noreferrer"
                              style={{ color: "#1d4ed8", fontSize: ".75rem", fontWeight: 600, textDecoration: "none", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap" }}>
                              📄 View
                            </a>
                          : r.type === "CC"
                            ? <ReceiptCell row={r} />
                            : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals footer */}
            <div style={{ borderTop: "2px solid #e5e7eb", background: "#f8fafc", padding: "14px 18px", display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: ".8rem", color: "#6b7280" }}>
                Showing <strong style={{ color: "#111827" }}>{filtered.length}</strong> of {rows.length} records
              </div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {[
                  ["Total", totalAmount, "#374151"],
                  ["Approved", approvedTotal, "#16a34a"],
                  ["Pending", pendingTotal, "#d97706"],
                  ["Rejected", rejectedTotal, "#dc2626"],
                ].map(([lbl, val, color]) => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: ".75rem", color: "#9ca3af", textTransform: "uppercase", fontWeight: 600 }}>{lbl}:</span>
                    <span style={{ fontSize: ".9rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{fmt(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================
   YODA REPORTS MENU
   Add new report entries to YODA_REPORTS as they come online.
   ============================================================ */
const YODA_REPORTS = [
  {
    id: "daily-sales",
    label: "Daily Sales Report",
    description: "Yesterday's sales vs. last year — scorecard, cohorts, store map, and store ranks",
    url: "https://aubuchon-it-command-center.vercel.app/reports/daily-sales-latest.html",
    icon: TrendingUp,
  },
  {
    id: "live-sales",
    label: "Live Sales",
    description: "Today's sales vs. plan — company total, top 20 stores, and top 20 products",
    icon: Zap,
    view: "live-sales",
  },
  {
    id: "live-sales-snowflake",
    label: "Live Sales (Snowflake)",
    description: "Same view, sourced live from Snowflake (FCT_LIVE_SALE) instead of YODA / Power BI",
    icon: Database,
    view: "live-sales-snowflake",
  },
];


/* ============================================================
   LIVE SALES VIEW — reads pre-computed data from /api/live-sales
   Refreshed every 10 min by a scheduled task. Loads instantly.
   ============================================================ */

function LiveSalesView({ goBack }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [companyTotal, setCompanyTotal] = useState(null);
  const [topStores, setTopStores] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [notReporting, setNotReporting] = useState([]);
  const [asOf, setAsOf] = useState("");
  const [cacheInfo, setCacheInfo] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [prediction, setPrediction] = useState(null);
  const [showEOD, setShowEOD] = useState(false);
  const [showAllStores, setShowAllStores] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showNotReporting, setShowNotReporting] = useState(false);

  // Shared renderer — takes an API-shaped payload and fans it out into state.
  var applyPayload = function (d, sourceTag) {
    if (!d || d.status !== "ok") throw new Error((d && d.error) || "Failed to load live sales");
    if (d.prediction && d.prediction.prediction) setPrediction(d.prediction);
    setCompanyTotal({
      sales: d.companyTotal.sales,
      plan: d.companyTotal.plan,
      gp: d.companyTotal.gp,
      gpPct: d.companyTotal.gpPct,
      txn: d.companyTotal.txns,
      customers: d.companyTotal.customers,
      storeCount: d.companyTotal.storeCount,
      pctToPlan: d.companyTotal.pctToPlan,
    });
    var stores = (d.topStores || []).map(function (s) {
      return {
        code: s.store,
        name: s.name || "Store " + s.store,
        city: s.city || "",
        state: s.state || "",
        sales: s.sales, plan: s.plan, gp: s.gp, txnCnt: s.txns,
      };
    });
    setTopStores(stores);
    setTopProducts((d.topProducts || []).map(function (p, i) {
      return { rank: i + 1, desc: p.product, sales: p.sales };
    }));
    setNotReporting((d.notReporting || []).map(function (s) {
      return {
        code: s.store,
        name: s.name || "Store " + s.store,
        city: s.city || "",
        state: s.state || "",
        plan: s.plan || 0,
      };
    }));
    if (d.asOfET) setAsOf(d.asOfET + " ET");
    else if (d.asOf) setAsOf(d.asOf);
    var info = sourceTag || (d.cached ? "Cached" : "Fresh");
    if (d.stale) info = "Stale cache";
    if (d.refreshedAt) info += " · refreshed " + new Date(d.refreshedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    setCacheInfo(info);
  };

  var loadStatic = function () {
    var url = "/api/snapshot?t=" + Date.now();
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("snapshot unavailable (" + r.status + ")");
      return r.json();
    });
  };

  var loadLive = function (force) {
    var url = "/api/live-sales" + (force ? "?refresh=true" : "");
    return fetch(url).then(function (r) { return r.json(); });
  };

  useEffect(function () {
    var cancelled = false;
    loadStatic()
      .then(function (d) {
        if (cancelled) return;
        applyPayload(d, "Cached snapshot");
        setSourceLabel("snapshot");
        setLoading(false);
      })
      .catch(function () {
        if (cancelled) return;
        loadLive(false)
          .then(function (d) {
            if (cancelled) return;
            applyPayload(d, d.cached ? "API cache" : "Fresh");
            setSourceLabel("api");
            setLoading(false);
          })
          .catch(function (err) {
            if (cancelled) return;
            setError(err.message);
            setLoading(false);
          });
      });
    return function () { cancelled = true; };
  }, []);

  var handleRefresh = function () {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    loadStatic()
      .then(function (d) {
        applyPayload(d, "Snapshot refreshed");
        setSourceLabel("snapshot");
      })
      .catch(function (err) { setError(err.message); })
      .finally(function () { setRefreshing(false); });
  };

  var fmtD = function (n) { return "$" + Math.round(n || 0).toLocaleString(); };
  var fmtPct = function (actual, plan) {
    if (!plan) return "\u2014";
    return ((actual / plan) * 100).toFixed(1) + "%";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50 to-slate-100 p-3 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <button onClick={goBack} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium shadow-sm mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Reports</span><span className="sm:hidden">Back</span>
          </button>
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin mb-4" />
            <p className="text-slate-600 font-medium">Loading live sales...</p>
            <p className="text-slate-400 text-sm mt-1">Loading latest snapshot</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-slate-100 p-3 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <button onClick={goBack} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium shadow-sm mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Reports</span><span className="sm:hidden">Back</span>
          </button>
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-red-800 mb-2">Unable to load live sales</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <p className="text-red-400 text-xs mt-2">The report cache may not be populated yet. The scheduled refresh runs every 10 minutes.</p>
          </div>
        </div>
      </div>
    );
  }

  var pctPlan = companyTotal.plan > 0 ? (companyTotal.sales / companyTotal.plan) * 100 : 0;
  var vTotal = (companyTotal.sales || 0) - (companyTotal.plan || 0);
  // Color the % to plan based on whether the EOD predictor thinks we will hit plan
  var predictorSaysHit = (function () {
    if (prediction && prediction.prediction && prediction.prediction.available) {
      var proj = Number(prediction.prediction.projectedEOD || 0);
      var plan = Number((prediction.current && prediction.current.plan) || companyTotal.plan || 0);
      return proj >= plan;
    }
    // No prediction available — fall back to current actual vs plan
    return vTotal >= 0;
  })();
  var onTrack = predictorSaysHit;
  var accentColor = onTrack ? "emerald" : "red";
  var progressPct = Math.min(pctPlan, 100);

  var visibleStores = showAllStores ? topStores : topStores.slice(0, 5);
  var visibleProducts = showAllProducts ? topProducts : topProducts.slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50 to-slate-100 p-3 sm:p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6">
          <button onClick={goBack} className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium shadow-sm text-sm shrink-0">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shrink-0">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">Live Sales</h1>
              <p className="text-slate-500 text-xs sm:text-sm truncate">{asOf}{cacheInfo ? " · " + cacheInfo : ""}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh snapshot"
            className={"flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium shadow-sm border text-sm " + (refreshing ? "bg-slate-100 text-slate-400 border-slate-200 cursor-wait" : "bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300")}
          >
            <RotateCcw className={"w-4 h-4 " + (refreshing ? "animate-spin" : "")} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing\u2026" : "Refresh"}</span>
          </button>
        </div>

        {/* ── Today's Performance ── */}
        <div className={"rounded-xl border-2 p-4 sm:p-5 md:p-6 mb-5 " + (onTrack ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Today's Performance</h2>
              <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 mt-1">{fmtD(companyTotal.sales)}</div>
            </div>
            <div className={"text-2xl sm:text-3xl font-extrabold text-right " + (onTrack ? "text-emerald-700" : "text-red-600")}>
              {pctPlan.toFixed(1)}% <span className="text-sm font-semibold text-slate-500">to plan</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{fmtD(companyTotal.sales)}</span>
              <span>Plan: {fmtD(companyTotal.plan)}</span>
            </div>
            <div className="w-full h-3 bg-white/70 rounded-full overflow-hidden border border-slate-200">
              <div
                className={"h-full rounded-full transition-all duration-500 " + (onTrack ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : "bg-gradient-to-r from-red-400 to-red-500")}
                style={{ width: progressPct + "%" }}
              />
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
              <div className="text-xs text-slate-500 mb-0.5">Variance</div>
              <div className={"text-lg sm:text-xl font-bold " + (onTrack ? "text-emerald-700" : "text-red-600")}>{vTotal >= 0 ? "+" : ""}{fmtD(vTotal)}</div>
            </div>
            <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
              <div className="text-xs text-slate-500 mb-0.5">Transactions</div>
              <div className="text-lg sm:text-xl font-bold text-slate-900">{Math.round(companyTotal.txn || 0).toLocaleString()}</div>
            </div>
            <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
              <div className="text-xs text-slate-500 mb-0.5">Gross Profit</div>
              <div className="text-lg sm:text-xl font-bold text-slate-900">{fmtD(companyTotal.gp)}</div>
            </div>
            <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
              <div className="text-xs text-slate-500 mb-0.5">Stores Reporting</div>
              <div className="text-lg sm:text-xl font-bold text-slate-900">
                {companyTotal.storeCount || 0}
                {notReporting.length > 0 && (
                  <span className="text-xs font-semibold text-red-600 ml-1.5">({notReporting.length} missing)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stores Not Reporting ── */}
        {(function () {
          var count = notReporting.length;
          var hasMissing = count > 0;
          var tc = function (str) { return String(str || "").replace(/\b\w+/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }); };
          var fmt$ = function (n) { return "$" + Math.round(n || 0).toLocaleString(); };
          if (!hasMissing) {
            return (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 sm:p-4 mb-5 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-sm font-medium text-emerald-800">
                  All expected stores are reporting ({companyTotal.storeCount || 0} of {companyTotal.storeCount || 0})
                </div>
              </div>
            );
          }
          return (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 mb-5 overflow-hidden">
              <button
                onClick={function () { setShowNotReporting(!showNotReporting); }}
                className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left hover:bg-amber-100/50 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                  <h2 className="font-bold text-slate-900">Stores Not Reporting</h2>
                  <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                    {count}
                  </span>
                  {!showNotReporting && (
                    <span className="text-xs text-amber-800 ml-1 truncate">
                      {notReporting.slice(0, 3).map(function (s) { return "#" + s.code; }).join(", ")}
                      {count > 3 ? " + " + (count - 3) + " more" : ""}
                    </span>
                  )}
                </div>
                <ChevronDown className={"w-5 h-5 text-amber-700 shrink-0 transition-transform duration-200 " + (showNotReporting ? "rotate-180" : "")} />
              </button>
              {showNotReporting && (
                <div className="border-t border-amber-200 bg-white overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-amber-50/60 text-left">
                        <th className="px-3 py-2 font-semibold text-slate-600 text-xs">#</th>
                        <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Store</th>
                        <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">Daily Plan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notReporting.map(function (s, i) {
                        return (
                          <tr key={s.code} className={i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}>
                            <td className="px-3 py-2 text-slate-400 font-medium">#{s.code}</td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-900">{tc(s.name)}</div>
                              <div className="text-xs text-slate-400">{tc(s.city)}{s.state ? ", " + s.state : ""}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-700">{fmt$(s.plan)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── EOD Forecast (collapsed by default) ── */}
        {(function () {
          if (!prediction || !prediction.prediction) return null;
          var p = prediction.prediction;
          if (!p.available) return null;
          var proj = Number(p.projectedEOD || 0);
          var plan = Number((prediction.current && prediction.current.plan) || 0);
          var projVar = plan > 0 ? proj - plan : 0;
          var projPct = plan > 0 ? (proj / plan) * 100 : 0;
          var above = projVar >= 0;
          var pBg = above ? "bg-gradient-to-br from-emerald-50 to-white border-emerald-200" : "bg-gradient-to-br from-red-50 to-white border-red-200";
          var pColor = above ? "text-emerald-700" : "text-red-600";
          var conf = String(p.confidence || "low");
          var confStyles = {
            "very low": "bg-slate-100 text-slate-600 border-slate-200",
            "low":      "bg-amber-100 text-amber-800 border-amber-200",
            "medium":   "bg-blue-100 text-blue-800 border-blue-200",
            "high":     "bg-emerald-100 text-emerald-800 border-emerald-200",
          };
          var confClass = confStyles[conf] || confStyles["low"];
          var hasBand = p.band && (p.band.low || p.band.high);
          return (
            <div className={"rounded-xl border-2 mb-5 overflow-hidden " + pBg}>
              <button
                onClick={function () { setShowEOD(!showEOD); }}
                className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left hover:bg-black/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <TrendingUp className="w-5 h-5 text-slate-700 shrink-0" />
                  <h2 className="font-bold text-slate-900">EOD Forecast</h2>
                  <span className={"text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border " + confClass}>
                    {conf}
                  </span>
                  {!showEOD && (
                    <span className={"text-sm font-bold ml-1 " + pColor}>{fmtD(proj)} ({projPct.toFixed(1)}%)</span>
                  )}
                </div>
                <ChevronDown className={"w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 " + (showEOD ? "rotate-180" : "")} />
              </button>
              {showEOD && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Projected EOD</div>
                      <div className={"text-xl sm:text-2xl md:text-3xl font-bold " + pColor}>{fmtD(proj)}</div>
                      {hasBand ? (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Range: {fmtD(p.band.low)} \u2013 {fmtD(p.band.high)}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Projected % to Plan</div>
                      <div className={"text-xl sm:text-2xl md:text-3xl font-bold " + pColor}>{projPct.toFixed(1)}%</div>
                      <div className="text-xs text-slate-400 mt-0.5">Plan: {fmtD(plan)}</div>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <div className="text-xs text-slate-500">Projected Variance</div>
                      <div className={"text-xl sm:text-2xl md:text-3xl font-bold " + pColor}>{above ? "+" : ""}{fmtD(projVar)}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{above ? "over plan" : "under plan"}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-1 mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
                    <span><strong className="text-slate-700">Method:</strong> {p.method}</span>
                    <span><strong className="text-slate-700">History days:</strong> {p.historyDays}</span>
                    {p.pctOfDayElapsed != null ? <span><strong className="text-slate-700">Day elapsed:</strong> {(p.pctOfDayElapsed * 100).toFixed(0)}%</span> : null}
                    {p.avgHistoricalEOD ? <span><strong className="text-slate-700">Avg prior EOD:</strong> {fmtD(p.avgHistoricalEOD)}</span> : null}
                  </div>
                  {p.note ? <div className="mt-2 text-xs text-slate-400 italic">{p.note}</div> : null}
                  {prediction.updatedAtET ? <div className="mt-1 text-xs text-slate-400 text-right">as of {prediction.updatedAtET}</div> : null}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Top Stores ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              <h2 className="font-bold text-slate-900 text-sm sm:text-base">Top Stores by Sales</h2>
            </div>
            <span className="text-xs text-slate-400">{topStores.length} stores</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs">#</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Store</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">Sales</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right hidden sm:table-cell">Plan</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right hidden sm:table-cell">Var</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">% Plan</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right hidden md:table-cell">Txns</th>
                </tr>
              </thead>
              <tbody>
                {visibleStores.map(function (s, i) {
                  var v = (s.sales || 0) - (s.plan || 0);
                  var vc = v >= 0 ? "text-emerald-700" : "text-red-600";
                  var tc = function (str) { return String(str || "").replace(/\b\w+/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }); };
                  return (
                    <tr key={s.code} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-3 py-2 text-slate-400 font-medium">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{tc(s.name)}</div>
                        <div className="text-xs text-slate-400">{tc(s.city)}{s.state ? ", " + s.state : ""} · #{s.code}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtD(s.sales)}</td>
                      <td className="px-3 py-2 text-right text-slate-500 hidden sm:table-cell">{fmtD(s.plan)}</td>
                      <td className={"px-3 py-2 text-right font-medium hidden sm:table-cell " + vc}>{v >= 0 ? "+" : ""}{fmtD(v)}</td>
                      <td className={"px-3 py-2 text-right font-medium " + vc}>{fmtPct(s.sales, s.plan)}</td>
                      <td className="px-3 py-2 text-right text-slate-500 hidden md:table-cell">{Math.round(s.txnCnt || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {topStores.length > 5 && (
            <button
              onClick={function () { setShowAllStores(!showAllStores); }}
              className="w-full py-3 text-sm font-medium text-amber-700 hover:bg-amber-50 border-t border-slate-100 flex items-center justify-center gap-1 transition-colors"
            >
              {showAllStores ? "Show Top 5" : "Show All " + topStores.length + " Stores"}
              <ChevronDown className={"w-4 h-4 transition-transform duration-200 " + (showAllStores ? "rotate-180" : "")} />
            </button>
          )}
        </div>

        {/* ── Top Products ── */}
        {topProducts.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-slate-900 text-sm sm:text-base">Top Products by Sales</h2>
              </div>
              <span className="text-xs text-slate-400">{topProducts.length} products</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-3 py-2 font-semibold text-slate-600 text-xs">#</th>
                    <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Product</th>
                    <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">Net Sales GL</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map(function (p, i) {
                    var tc = function (str) { return String(str || "").replace(/\b\w+/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }); };
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                        <td className="px-3 py-2 text-slate-400 font-medium">{p.rank}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{tc(p.desc)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtD(p.sales)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {topProducts.length > 5 && (
              <button
                onClick={function () { setShowAllProducts(!showAllProducts); }}
                className="w-full py-3 text-sm font-medium text-amber-700 hover:bg-amber-50 border-t border-slate-100 flex items-center justify-center gap-1 transition-colors"
              >
                {showAllProducts ? "Show Top 5" : "Show All " + topProducts.length + " Products"}
                <ChevronDown className={"w-4 h-4 transition-transform duration-200 " + (showAllProducts ? "rotate-180" : "")} />
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 p-6 text-center">
            <Tag className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Product-level data is not available for today yet.</p>
          </div>
        )}

        <div className="text-center text-xs text-slate-400 py-4">
          Data from YODA · Power BI / MDM Semantic Model · Auto-refreshed every 10 min
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   LIVE SALES (SNOWFLAKE) VIEW — reads from /api/live-sales-snowflake
   Same visual layout as LiveSalesView, and same EOD predictor
   (shared engine — reads from /api/prediction?source=snowflake,
   written by /api/log-live-sales?source=snowflake every 10 min).
   ============================================================ */
function LiveSalesSnowflakeView({ goBack }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [companyTotal, setCompanyTotal] = useState(null);
  const [topStores, setTopStores] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [notReporting, setNotReporting] = useState([]);
  const [estimatedMissing, setEstimatedMissing] = useState(null);
  const [asOf, setAsOf] = useState("");
  const [cacheInfo, setCacheInfo] = useState("");
  const [showAllStores, setShowAllStores] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showNotReporting, setShowNotReporting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [showEOD, setShowEOD] = useState(false);
  // Store-filter state. "" means company-wide; otherwise a STORE_CD like "001".
  const [selectedStore, setSelectedStore] = useState("");
  const [allStores, setAllStores] = useState([]);
  // Typed text that narrows the store dropdown (matches code / name / city).
  const [storeSearch, setStoreSearch] = useState("");
  // Combobox open/closed state — the search input lives inside the panel.
  const [storeOpen, setStoreOpen] = useState(false);
  const storeBoxRef = useRef(null);
  // Close on outside click / ESC. The search input resets on close so the
  // user always opens a fresh list.
  useEffect(function () {
    if (!storeOpen) return;
    var onDocClick = function (e) {
      if (storeBoxRef.current && !storeBoxRef.current.contains(e.target)) {
        setStoreOpen(false);
        setStoreSearch("");
      }
    };
    var onKey = function (e) {
      if (e.key === "Escape") { setStoreOpen(false); setStoreSearch(""); }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return function () {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [storeOpen]);
  // Date to query. "" = today's live snapshot (default); otherwise a
  // YYYY-MM-DD string for the historical end-of-day view. Computed against
  // America/New_York so the dashboard agrees with the Aubuchon business day.
  var todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [selectedDate, setSelectedDate] = useState(todayET);
  var isToday = selectedDate === todayET;

  var applyPayload = function (d) {
    if (!d || d.status !== "ok") throw new Error((d && d.error) || "Failed to load live sales");
    setCompanyTotal({
      sales: d.companyTotal.sales,
      plan: d.companyTotal.plan,
      gp: d.companyTotal.gp,
      gpPct: d.companyTotal.gpPct,
      txn: d.companyTotal.txns,
      customers: d.companyTotal.customers,
      storeCount: d.companyTotal.storeCount,
      pctToPlan: d.companyTotal.pctToPlan,
    });
    setTopStores((d.topStores || []).map(function (s) {
      return {
        code: s.store,
        name: s.name || "Store " + s.store,
        city: s.city || "",
        state: s.state || "",
        sales: s.sales, plan: s.plan, gp: s.gp, txnCnt: s.txns,
      };
    }));
    setTopProducts((d.topProducts || []).map(function (p, i) {
      return { rank: i + 1, desc: p.product, sales: p.sales };
    }));
    setNotReporting((d.notReporting || []).map(function (s) {
      return {
        code: s.store,
        name: s.name || "Store " + s.store,
        city: s.city || "",
        state: s.state || "",
        plan: s.plan || 0,
      };
    }));
    // Per-store estimates (today) or EOD estimates (historical). Indexed
    // client-side by store code so the missing-stores table can lookup its
    // own row without a second pass.
    if (d.estimatedMissing && Array.isArray(d.estimatedMissing.stores)) {
      var byCode = {};
      d.estimatedMissing.stores.forEach(function (s) {
        byCode[String(s.store)] = {
          dowAvg: s.dowAvg || 0,
          samples: s.samples || 0,
          basis: s.basis || "dowAvg",
          estimatedCurrent: s.estimatedCurrent || 0,
          estimatedEOD: s.estimatedEOD || 0,
        };
      });
      setEstimatedMissing({
        paceAtNow: d.estimatedMissing.paceAtNow || 0,
        sampleWeeks: d.estimatedMissing.sampleWeeks || 0,
        totalEstimatedCurrent: d.estimatedMissing.totalEstimatedCurrent || 0,
        totalEstimatedEOD: d.estimatedMissing.totalEstimatedEOD || 0,
        projectedCompanyCurrent: d.estimatedMissing.projectedCompanyCurrent || 0,
        projectedCompanyEOD: d.estimatedMissing.projectedCompanyEOD || 0,
        byCode: byCode,
      });
    } else {
      setEstimatedMissing(null);
    }
    if (Array.isArray(d.allStores) && d.allStores.length) {
      setAllStores(d.allStores.map(function (s) {
        return { code: s.store, name: s.name || ("Store " + s.store), city: s.city || "", state: s.state || "" };
      }));
    }
    if (d.asOfET) setAsOf(d.asOfET);
    var info;
    if (d.cached) {
      // Historical snapshot from the repo cache — no Snowflake round-trip.
      var ts = d.cachedAt ? new Date(d.cachedAt) : null;
      info = "From snapshot";
      if (ts && !isNaN(ts.getTime())) {
        info += " · frozen " + ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    } else {
      info = "Snowflake";
      if (d.refreshedAt) info += " · refreshed " + new Date(d.refreshedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    setCacheInfo(info);
  };

  var loadSnowflake = function (storeCode, dateStr) {
    var url = "/api/live-sales-snowflake?t=" + Date.now();
    if (storeCode) url += "&store=" + encodeURIComponent(storeCode);
    if (dateStr && dateStr !== todayET) url += "&date=" + encodeURIComponent(dateStr);
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("Snowflake API unavailable (" + r.status + ")");
      return r.json();
    });
  };

  // The Snowflake endpoint only returns raw data — no predictor. The EOD
  // prediction is written out-of-band every 10 min by
  // /api/log-live-sales?source=snowflake to public/data/live-sales-snowflake/
  // and served as a static JSON file.
  var loadPrediction = function () {
    var url = "/api/prediction?source=snowflake&t=" + Date.now();
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) return null;
      return r.json().catch(function () { return null; });
    }).catch(function () { return null; });
  };

  // Re-fetch whenever the selected store OR selected date changes. The EOD
  // predictor is company-wide-today-only, so we only fetch it on mount.
  useEffect(function () {
    var cancelled = false;
    setRefreshing(true);
    setError(null);
    loadSnowflake(selectedStore, selectedDate)
      .then(function (d) { if (!cancelled) { applyPayload(d); setLoading(false); setRefreshing(false); } })
      .catch(function (err) { if (!cancelled) { setError(err.message); setLoading(false); setRefreshing(false); } });
    return function () { cancelled = true; };
  }, [selectedStore, selectedDate]);

  useEffect(function () {
    var cancelled = false;
    loadPrediction().then(function (p) { if (!cancelled && p) setPrediction(p); });
    return function () { cancelled = true; };
  }, []);

  var handleRefresh = function () {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    Promise.all([
      loadSnowflake(selectedStore, selectedDate).then(applyPayload),
      // Predictor is company-wide-today-only; skip it when viewing a single
      // store or a historical date.
      (selectedStore || !isToday)
        ? Promise.resolve(null)
        : loadPrediction().then(function (p) { if (p) setPrediction(p); }),
    ])
      .catch(function (err) { setError(err.message); })
      .finally(function () { setRefreshing(false); });
  };

  var fmtD = function (n) { return "$" + Math.round(n || 0).toLocaleString(); };
  var fmtPct = function (actual, plan) {
    if (!plan) return "\u2014";
    return ((actual / plan) * 100).toFixed(1) + "%";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50 to-slate-100 p-3 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <button onClick={goBack} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium shadow-sm mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Reports</span><span className="sm:hidden">Back</span>
          </button>
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-3 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-4" />
            <p className="text-slate-600 font-medium">Querying Snowflake...</p>
            <p className="text-slate-400 text-sm mt-1">FCT_LIVE_SALE · may take a few seconds on first load</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-slate-100 p-3 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <button onClick={goBack} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium shadow-sm mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Reports</span><span className="sm:hidden">Back</span>
          </button>
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-red-800 mb-2">Unable to load Snowflake live sales</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <p className="text-red-400 text-xs mt-2">Check that the Vercel Snowflake env vars are set and the warehouse is awake.</p>
          </div>
        </div>
      </div>
    );
  }

  var pctPlan = companyTotal.plan > 0 ? (companyTotal.sales / companyTotal.plan) * 100 : 0;
  var vTotal = (companyTotal.sales || 0) - (companyTotal.plan || 0);
  // Color the % to plan based on whether the EOD predictor thinks we will hit
  // plan. The predictor is a company-wide, today-only model, so when a single
  // store is selected we fall back to the simpler "are they already above plan"
  // measure — otherwise a store that's beaten plan would still show red
  // whenever the company as a whole is projected to miss.
  var predictorSaysHit = (function () {
    if (prediction && prediction.prediction && prediction.prediction.available) {
      var proj = Number(prediction.prediction.projectedEOD || 0);
      var plan = Number((prediction.current && prediction.current.plan) || companyTotal.plan || 0);
      return proj >= plan;
    }
    return vTotal >= 0;
  })();
  var onTrack = selectedStore ? (vTotal >= 0) : predictorSaysHit;
  var progressPct = Math.min(pctPlan, 100);

  var visibleStores = showAllStores ? topStores : topStores.slice(0, 5);
  var visibleProducts = showAllProducts ? topProducts : topProducts.slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50 to-slate-100 p-3 sm:p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6">
          <button onClick={goBack} className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium shadow-sm text-sm shrink-0">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-lg shrink-0">
              <Database className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">Live Sales <span className="text-sky-600">(Snowflake)</span></h1>
              <p className="text-slate-500 text-xs sm:text-sm truncate">{asOf}{cacheInfo ? " · " + cacheInfo : ""}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Re-query Snowflake"
            className={"flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium shadow-sm border text-sm " + (refreshing ? "bg-slate-100 text-slate-400 border-slate-200 cursor-wait" : "bg-white text-slate-700 border-slate-200 hover:bg-sky-50 hover:border-sky-300")}
          >
            <RotateCcw className={"w-4 h-4 " + (refreshing ? "animate-spin" : "")} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing\u2026" : "Refresh"}</span>
          </button>
        </div>

        {/* Store filter dropdown — empty value means company-wide. Narrower
            than full width so a date selector can sit next to it later. Also
            hides store 000 (warehouse) as a client-side safety net. */}
        {(function () {
          // Title-case everything, then force standalone 2-letter tokens after
          // a comma back to UPPERCASE so "Gardner, Ma" renders as "Gardner, MA".
          var tc = function (str) {
            var out = String(str || "").replace(/\b\w+/g, function (w) {
              return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            });
            return out.replace(/,\s*([A-Za-z]{2})\b/g, function (_m, st) {
              return ", " + st.toUpperCase();
            });
          };
          var q = String(storeSearch || "").trim().toLowerCase();
          var visibleStores = allStores.filter(function (s) {
            if (String(s.code) === "000") return false;                 // hide warehouse
            if (!q) return true;
            var hay = (String(s.code) + " " + String(s.name || "") + " " + String(s.city || "") + " " + String(s.state || "")).toLowerCase();
            return hay.indexOf(q) !== -1;
          });
          // Always surface the currently-selected store even if the search filters it out.
          var hasSelected = !selectedStore || visibleStores.some(function (s) { return s.code === selectedStore; });
          if (!hasSelected) {
            var pinned = allStores.find(function (s) { return s.code === selectedStore; });
            if (pinned) visibleStores = [pinned].concat(visibleStores);
          }
          return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4 mb-5 flex items-center gap-2 flex-wrap max-w-3xl">
              <label htmlFor="snowflake-store-button" className="text-sm font-semibold text-slate-700 shrink-0">
                View:
              </label>
              {(function () {
                var selectedLabel = "Entire Company";
                if (selectedStore) {
                  var sel = allStores.find(function (s) { return s.code === selectedStore; });
                  if (sel) {
                    selectedLabel = sel.code + " · " + (tc(sel.name) || ("Store " + sel.code));
                  } else {
                    selectedLabel = "Store " + selectedStore;
                  }
                }
                return (
                  <div ref={storeBoxRef} className="relative flex-1 min-w-[200px]">
                    <button
                      id="snowflake-store-button"
                      type="button"
                      onClick={function () {
                        var next = !storeOpen;
                        setStoreOpen(next);
                        if (!next) setStoreSearch("");
                      }}
                      disabled={refreshing}
                      aria-haspopup="listbox"
                      aria-expanded={storeOpen}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 text-left hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-wait"
                    >
                      <span className="truncate">{selectedLabel}</span>
                      <ChevronDown className={"w-4 h-4 text-slate-500 shrink-0 transition-transform duration-150 " + (storeOpen ? "rotate-180" : "")} />
                    </button>
                    {storeOpen && (
                      <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50">
                          <input
                            type="text"
                            value={storeSearch}
                            onChange={function (e) { setStoreSearch(e.target.value); }}
                            placeholder="Search stores…"
                            aria-label="Search stores"
                            autoFocus
                            className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                          />
                        </div>
                        <div role="listbox" className="overflow-y-auto">
                          <button
                            type="button"
                            onClick={function () {
                              setSelectedStore("");
                              setStoreSearch("");
                              setStoreOpen(false);
                            }}
                            className={"w-full text-left px-3 py-2 text-sm border-b border-slate-100 hover:bg-sky-50 " + (!selectedStore ? "bg-sky-100 text-sky-900 font-semibold" : "text-slate-700")}
                          >
                            Entire Company
                          </button>
                          {visibleStores.map(function (s) {
                            var label = s.code + " · " + (tc(s.name) || ("Store " + s.code));
                            var isSel = s.code === selectedStore;
                            return (
                              <button
                                key={s.code}
                                type="button"
                                role="option"
                                aria-selected={isSel}
                                onClick={function () {
                                  setSelectedStore(s.code);
                                  setStoreSearch("");
                                  setStoreOpen(false);
                                }}
                                className={"w-full text-left px-3 py-2 text-sm hover:bg-sky-50 " + (isSel ? "bg-sky-100 text-sky-900 font-semibold" : "text-slate-700")}
                              >
                                {label}
                              </button>
                            );
                          })}
                          {visibleStores.length === 0 && q && (
                            <div className="px-3 py-4 text-sm text-slate-500 italic text-center">
                              No matches for "{storeSearch}"
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <label htmlFor="snowflake-date-input" className="text-sm font-semibold text-slate-700 shrink-0 ml-1">
                Date:
              </label>
              <input
                id="snowflake-date-input"
                type="date"
                value={selectedDate}
                max={todayET}
                onChange={function (e) { setSelectedDate(e.target.value || todayET); }}
                disabled={refreshing}
                aria-label="Date"
                title={isToday ? "Today (live)" : "Historical end-of-day view"}
                className={"px-2 py-2 rounded-lg border text-sm text-slate-800 bg-white hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-400 " + (isToday ? "border-slate-200" : "border-sky-400 bg-sky-50")}
              />
              {(selectedStore || !isToday) && (
                <button
                  onClick={function () {
                    setSelectedStore("");
                    setStoreSearch("");
                    setSelectedDate(todayET);
                    setStoreOpen(false);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 shrink-0"
                  title="Reset to today, entire company"
                >
                  Clear
                </button>
              )}
            </div>
          );
        })()}

        {/* Today's Performance */}
        <div className={"rounded-xl border-2 p-4 sm:p-5 md:p-6 mb-5 " + (onTrack ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Today's Performance</h2>
              <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 mt-1">{fmtD(companyTotal.sales)}</div>
              {/* Projected-with-estimate line. Only shown when we have
                  estimates for non-reporting stores AND the user isn't viewing
                  a single store. Keeps the big number above honest (raw
                  actuals) and surfaces the best-guess total as a subtler
                  second line. */}
              {!selectedStore && estimatedMissing && estimatedMissing.totalEstimatedCurrent > 0 && (
                <div className="text-xs sm:text-sm text-slate-600 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">est.</span>
                  <span>+{fmtD(estimatedMissing.totalEstimatedCurrent)}</span>
                  <span className="text-slate-400">from {notReporting.length} missing</span>
                  <span className="text-slate-300">&rarr;</span>
                  <span className="font-semibold text-slate-700">{fmtD(isToday ? estimatedMissing.projectedCompanyCurrent : estimatedMissing.projectedCompanyEOD)} projected</span>
                </div>
              )}
            </div>
            <div className={"text-2xl sm:text-3xl font-extrabold text-right " + (onTrack ? "text-emerald-700" : "text-red-600")}>
              {pctPlan.toFixed(1)}% <span className="text-sm font-semibold text-slate-500">to plan</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{fmtD(companyTotal.sales)}</span>
              <span>Plan: {fmtD(companyTotal.plan)}</span>
            </div>
            <div className="w-full h-3 bg-white/70 rounded-full overflow-hidden border border-slate-200">
              <div
                className={"h-full rounded-full transition-all duration-500 " + (onTrack ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : "bg-gradient-to-r from-red-400 to-red-500")}
                style={{ width: progressPct + "%" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
              <div className="text-xs text-slate-500 mb-0.5">Variance</div>
              <div className={"text-lg sm:text-xl font-bold " + (onTrack ? "text-emerald-700" : "text-red-600")}>{vTotal >= 0 ? "+" : ""}{fmtD(vTotal)}</div>
            </div>
            <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
              <div className="text-xs text-slate-500 mb-0.5">Transactions</div>
              <div className="text-lg sm:text-xl font-bold text-slate-900">{Math.round(companyTotal.txn || 0).toLocaleString()}</div>
            </div>
            <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
              <div className="text-xs text-slate-500 mb-0.5">Gross Profit</div>
              <div className="text-lg sm:text-xl font-bold text-slate-900">{fmtD(companyTotal.gp)}</div>
            </div>
            {/* Stores Reporting — click-to-expand missing list when any are
                absent. Non-clickable for per-store view or historical dates
                (notReporting is meaningful only for today's company-wide view). */}
            {(function () {
              var canExpand = !selectedStore && isToday && notReporting.length > 0;
              var inner = (
                <>
                  <div className="text-xs text-slate-500 mb-0.5 flex items-center justify-between gap-2">
                    <span>{selectedStore ? "Store" : "Stores Reporting"}</span>
                    {canExpand && (
                      <ChevronDown className={"w-4 h-4 text-slate-400 transition-transform duration-200 " + (showNotReporting ? "rotate-180" : "")} />
                    )}
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-slate-900">
                    {selectedStore ? (
                      "#" + selectedStore
                    ) : (
                      <>
                        {companyTotal.storeCount || 0}
                        {notReporting.length > 0 && (
                          <span className="text-xs font-semibold text-red-600 ml-1.5">({notReporting.length} missing)</span>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
              if (canExpand) {
                return (
                  <button
                    type="button"
                    onClick={function () { setShowNotReporting(!showNotReporting); }}
                    className="bg-white/60 rounded-lg p-3 border border-slate-200/50 text-left hover:bg-white hover:border-slate-300 transition-colors cursor-pointer"
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <div className="bg-white/60 rounded-lg p-3 border border-slate-200/50">
                  {inner}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Stores Not Reporting — inline expansion opened by clicking the
            Stores Reporting metric card above. Only renders for today's
            company-wide view (past dates / per-store filters have nothing
            meaningful to show). */}
        {!selectedStore && isToday && showNotReporting && notReporting.length > 0 && (function () {
          var tc = function (str) { return String(str || "").replace(/\b\w+/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }); };
          var fmt$ = function (n) { return "$" + Math.round(n || 0).toLocaleString(); };
          return (
            <div className="rounded-xl border border-slate-200 bg-white mb-5 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-slate-700">Stores Not Reporting</span>
                <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                  {notReporting.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/60 text-left">
                      <th className="px-3 py-2 font-semibold text-slate-600 text-xs">#</th>
                      <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Store</th>
                      <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">Daily Plan</th>
                      <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">Est. Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notReporting.map(function (s, i) {
                      var est = estimatedMissing && estimatedMissing.byCode ? estimatedMissing.byCode[String(s.code)] : null;
                      var estVal = est ? est.estimatedCurrent : 0;
                      var basisLabel = est
                        ? (est.basis === "dowAvg" ? (est.samples + "w avg") : "plan-based")
                        : "";
                      return (
                        <tr key={s.code} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                          <td className="px-3 py-2 text-slate-400 font-medium">#{s.code}</td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{tc(s.name)}</div>
                            <div className="text-xs text-slate-400">{tc(s.city)}{s.state ? ", " + s.state : ""}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700">{fmt$(s.plan)}</td>
                          <td className="px-3 py-2 text-right">
                            {est ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] uppercase tracking-wide font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">est.</span>
                                  <span className="font-semibold text-slate-800">{fmt$(estVal)}</span>
                                </div>
                                <div className="text-[10px] text-slate-400">{basisLabel}</div>
                              </div>
                            ) : (
                              <span className="text-slate-300">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {estimatedMissing && estimatedMissing.totalEstimatedCurrent > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200">
                        <td className="px-3 py-2 text-xs text-slate-500" colSpan={2}>
                          Est. based on {estimatedMissing.sampleWeeks || 8}-week same-DOW average · pace {(((estimatedMissing.paceAtNow || 0) * 100) | 0)}%. Replaced with actuals when the store reports (typically next day).
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt$(estimatedMissing.totalEstimatedCurrent)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        })()}

        {/* ── EOD Forecast (collapsed by default) — company-wide and
              today only (the "forecast" is meaningless for past dates). ── */}
        {!selectedStore && isToday && (function () {
          if (!prediction || !prediction.prediction) return null;
          var p = prediction.prediction;
          if (!p.available) return null;
          var proj = Number(p.projectedEOD || 0);
          var plan = Number((prediction.current && prediction.current.plan) || 0);
          var projVar = plan > 0 ? proj - plan : 0;
          var projPct = plan > 0 ? (proj / plan) * 100 : 0;
          var above = projVar >= 0;
          var pBg = above ? "bg-gradient-to-br from-emerald-50 to-white border-emerald-200" : "bg-gradient-to-br from-red-50 to-white border-red-200";
          var pColor = above ? "text-emerald-700" : "text-red-600";
          var conf = String(p.confidence || "low");
          var confStyles = {
            "very low": "bg-slate-100 text-slate-600 border-slate-200",
            "low":      "bg-amber-100 text-amber-800 border-amber-200",
            "medium":   "bg-blue-100 text-blue-800 border-blue-200",
            "high":     "bg-emerald-100 text-emerald-800 border-emerald-200",
          };
          var confClass = confStyles[conf] || confStyles["low"];
          var hasBand = p.band && (p.band.low || p.band.high);
          var sd = p.shapeDetail || {};
          return (
            <div className={"rounded-xl border-2 mb-5 overflow-hidden " + pBg}>
              <button
                onClick={function () { setShowEOD(!showEOD); }}
                className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left hover:bg-black/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <TrendingUp className="w-5 h-5 text-slate-700 shrink-0" />
                  <h2 className="font-bold text-slate-900">EOD Forecast</h2>
                  <span className={"text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border " + confClass}>
                    {conf}
                  </span>
                  {!showEOD && (
                    <span className={"text-sm font-bold ml-1 " + pColor}>{fmtD(proj)} ({projPct.toFixed(1)}%)</span>
                  )}
                </div>
                <ChevronDown className={"w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 " + (showEOD ? "rotate-180" : "")} />
              </button>
              {showEOD && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Projected EOD</div>
                      <div className={"text-xl sm:text-2xl md:text-3xl font-bold " + pColor}>{fmtD(proj)}</div>
                      {hasBand ? (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Range: {fmtD(p.band.low)} \u2013 {fmtD(p.band.high)}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Projected % to Plan</div>
                      <div className={"text-xl sm:text-2xl md:text-3xl font-bold " + pColor}>{projPct.toFixed(1)}%</div>
                      <div className="text-xs text-slate-400 mt-0.5">Plan: {fmtD(plan)}</div>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <div className="text-xs text-slate-500">Projected Variance</div>
                      <div className={"text-xl sm:text-2xl md:text-3xl font-bold " + pColor}>{above ? "+" : ""}{fmtD(projVar)}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{above ? "over plan" : "under plan"}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-1 mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
                    <span><strong className="text-slate-700">Method:</strong> {p.method}</span>
                    <span><strong className="text-slate-700">History days:</strong> {sd.historyDays != null ? sd.historyDays : "\u2014"}</span>
                    {p.pctOfDayElapsed != null ? <span><strong className="text-slate-700">Day elapsed:</strong> {(p.pctOfDayElapsed * 100).toFixed(0)}%</span> : null}
                    {sd.avgHistoricalEOD ? <span><strong className="text-slate-700">Avg prior EOD:</strong> {fmtD(sd.avgHistoricalEOD)}</span> : null}
                  </div>
                  {p.note ? <div className="mt-2 text-xs text-slate-400 italic">{p.note}</div> : null}
                  {prediction.updatedAtET ? <div className="mt-1 text-xs text-slate-400 text-right">as of {prediction.updatedAtET}</div> : null}
                </div>
              )}
            </div>
          );
        })()}

        {/* Top Stores — header label adapts when scoped to a single store. */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-600" />
              <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                {selectedStore ? "Store Detail" : "Top Stores by Sales"}
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {selectedStore ? "1 store" : (topStores.length + " stores")}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs">#</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Store</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">Sales</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right hidden sm:table-cell">Plan</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right hidden sm:table-cell">Var</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">% Plan</th>
                  <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right hidden md:table-cell">Txns</th>
                </tr>
              </thead>
              <tbody>
                {visibleStores.map(function (s, i) {
                  var v = (s.sales || 0) - (s.plan || 0);
                  var vc = v >= 0 ? "text-emerald-700" : "text-red-600";
                  var tc = function (str) { return String(str || "").replace(/\b\w+/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }); };
                  return (
                    <tr key={s.code} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-3 py-2 text-slate-400 font-medium">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{tc(s.name)}</div>
                        <div className="text-xs text-slate-400">{tc(s.city)}{s.state ? ", " + s.state : ""} · #{s.code}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtD(s.sales)}</td>
                      <td className="px-3 py-2 text-right text-slate-500 hidden sm:table-cell">{fmtD(s.plan)}</td>
                      <td className={"px-3 py-2 text-right font-medium hidden sm:table-cell " + vc}>{v >= 0 ? "+" : ""}{fmtD(v)}</td>
                      <td className={"px-3 py-2 text-right font-medium " + vc}>{fmtPct(s.sales, s.plan)}</td>
                      <td className="px-3 py-2 text-right text-slate-500 hidden md:table-cell">{Math.round(s.txnCnt || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {topStores.length > 5 && (
            <button
              onClick={function () { setShowAllStores(!showAllStores); }}
              className="w-full py-3 text-sm font-medium text-sky-700 hover:bg-sky-50 border-t border-slate-100 flex items-center justify-center gap-1 transition-colors"
            >
              {showAllStores ? "Show Top 5" : "Show All " + topStores.length + " Stores"}
              <ChevronDown className={"w-4 h-4 transition-transform duration-200 " + (showAllStores ? "rotate-180" : "")} />
            </button>
          )}
        </div>

        {/* Top Products */}
        {topProducts.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-sky-600" />
                <h2 className="font-bold text-slate-900 text-sm sm:text-base">Top Products by Sales</h2>
              </div>
              <span className="text-xs text-slate-400">{topProducts.length} products</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-3 py-2 font-semibold text-slate-600 text-xs">#</th>
                    <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Product</th>
                    <th className="px-3 py-2 font-semibold text-slate-600 text-xs text-right">Line Ext. Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map(function (p, i) {
                    var tc = function (str) { return String(str || "").replace(/\b\w+/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }); };
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                        <td className="px-3 py-2 text-slate-400 font-medium">{p.rank}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{tc(p.desc)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtD(p.sales)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {topProducts.length > 5 && (
              <button
                onClick={function () { setShowAllProducts(!showAllProducts); }}
                className="w-full py-3 text-sm font-medium text-sky-700 hover:bg-sky-50 border-t border-slate-100 flex items-center justify-center gap-1 transition-colors"
              >
                {showAllProducts ? "Show Top 5" : "Show All " + topProducts.length + " Products"}
                <ChevronDown className={"w-4 h-4 transition-transform duration-200 " + (showAllProducts ? "rotate-180" : "")} />
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 p-6 text-center">
            <Tag className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Product-level data is not available for today yet.</p>
          </div>
        )}

        <div className="text-center text-xs text-slate-400 py-4">
          Data from Snowflake · PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE · Live query on each load
          {selectedStore ? " · Filtered to store #" + selectedStore : ""}
        </div>
      </div>
    </div>
  );
}

function YODAReports({ goHome }) {
  const [subView, setSubView] = useState(null);

  if (subView === "live-sales") {
    return <LiveSalesView goBack={function () { setSubView(null); }} />;
  }

  if (subView === "live-sales-snowflake") {
    return <LiveSalesSnowflakeView goBack={function () { setSubView(null); }} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">YODA Reports</h1>
              <p className="text-slate-600 text-sm">Operational reports powered by YODA / Power BI data</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {YODA_REPORTS.map(function (rpt) {
            var Icon = rpt.icon || FileText;
            if (rpt.view) {
              return (
                <button
                  key={rpt.id}
                  onClick={function () { setSubView(rpt.view); }}
                  className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-emerald-400 hover:shadow-lg transition-all text-left cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700">{rpt.label}</h3>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{rpt.description}</p>
                    </div>
                  </div>
                </button>
              );
            }
            return (
              <a
                key={rpt.id}
                href={rpt.url}
                className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-emerald-400 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700">{rpt.label}</h3>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{rpt.description}</p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("section") || null;
  });
  const { userAccess, allUsers, isAdmin, canAccessSection, saveAllUsers, userEmail } = useUserAccess();

  // Loading state
  if (userAccess === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Access denied
  if (userAccess === false) {
    return <AccessDeniedScreen />;
  }

  // Admin panel (admin only)
  if (activeSection === "admin" && isAdmin) {
    return <AdminPanel goHome={() => setActiveSection(null)} allUsers={allUsers} saveAllUsers={saveAllUsers} />;
  }

  // Section routing — only if user has access
  if (activeSection === "projects" && canAccessSection("projects")) {
    return <ITProjectDashboard goHome={() => setActiveSection(null)} isAdmin={isAdmin} allAccessUsers={allUsers} />;
  }

  if (activeSection === "ap-invoices" && canAccessSection("ap-invoices")) {
    return <APInvoices goHome={() => setActiveSection(null)} goHistory={() => setActiveSection("payment-history")} />;
  }

  if (activeSection === "payment-history" && canAccessSection("payment-history")) {
    return <PaymentHistory goHome={() => setActiveSection(null)} goBack={() => setActiveSection(null)} />;
  }

  if (activeSection === "yoda" && canAccessSection("yoda")) {
    return <YODAReports goHome={() => setActiveSection(null)} />;
  }

  // Future sections:
  // if (activeSection === "wells-cc" && canAccessSection("wells-cc")) return <WellsCC goHome={() => setActiveSection(null)} goHistory={() => setActiveSection("payment-history")} />;

  return <HomeScreen onNavigate={setActiveSection} canAccessSection={canAccessSection} isAdmin={isAdmin} />;
}
  