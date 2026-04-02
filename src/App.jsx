﻿import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Download, AlertTriangle, Clock,
  CheckCircle, XCircle, Pause, FlaskConical, BarChart3, Calendar, Edit3,
  Save, X, User, Server, Shield, Monitor, Headphones, Layers, Search,
  List, LayoutGrid, ArrowRight, GripVertical, Square, CheckSquare,
  FolderOpen, Filter, ChevronUp, Zap, MoveRight, LogOut, Users,
  Building2, History, FileText, Tag, Eye, Briefcase, Archive, Inbox,
  ListChecks, CircleDot, RotateCcw, ArrowUpDown,
  Home, CreditCard, TrendingUp, Database, Lock, ArrowLeft, Link2
} from "lucide-react";
import { auth, signOut, db } from "./firebase";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

/* =====================================================================
   CONFIGURATION
   ===================================================================== */

const STATUS_OPTIONS = ["Not Started", "In Progress", "Testing in Lab", "Done", "On Hold", "Blocked"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const TIER_OPTIONS = ["Project", "Quick Win", "Ongoing Support"];
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
  { id: "changelog", label: "Change Log",  icon: History },
];

/* =====================================================================
   INITIAL PROJECT DATA  (updated April 1 2026 from IT_Systems_Projects_2026.docx)
   ===================================================================== */

const initialProjects = [
  // Enterprise Systems ÃÂ¢ÃÂÃÂ Active Projects
  { id: 40, departments: ["Enterprise Systems"], name: "Merchant 2025.3 Update", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "4/8/2026", roadblocks: "External teams not responding to feedback requests; caused deferral", milestones: "", nextSteps: "", notes: "Upgrade Mi9 Merchant/MMS to version 2025.3 on the live environment", completedDate: "", subtasks: [], tier: "project" },
  { id: 41, departments: ["Enterprise Systems"], name: "Customer History Lookup v2 (Pre-Acquisition POS)", owner: "Dave Faucher", status: "In Progress", priority: "Low", pct: 0, date: "4/10/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Extend customer history lookup to include data from pre-acquisition POS systems: EPICOR, Rock Solid, Spruce, and others", completedDate: "", subtasks: [], tier: "project" },
  { id: 42, departments: ["Enterprise Systems"], name: "SpacePlan v2.0 Store (Mobile First)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "4/9/2026", roadblocks: "UX feedback cycles may extend timeline", milestones: "Beta Release", nextSteps: "", notes: "Redevelop the store-facing SpacePlan tool with a mobile-first responsive UI", completedDate: "", subtasks: [], tier: "project" },
  { id: 43, departments: ["Enterprise Systems"], name: "EZ-Commerce Website Integrations", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "5/29/2026", roadblocks: "Team bandwidth and lack of vendor requirements could extend timeline", milestones: "", nextSteps: "", notes: "Integrate HardwareStore.com with loyalty reward APIs (Aubuchon & Ace), promotions, Mi9/EDI BOSS order processing, and Benjamin Moore Color Selector data structure", completedDate: "", subtasks: [], tier: "project" },
  { id: 44, departments: ["Enterprise Systems"], name: "Progress to Snowflake (AR & Mi9)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "4/23/2026", roadblocks: "IT and Accounting team bandwidth for due diligence prior to release", milestones: "", nextSteps: "", notes: "Centralize AR Processes from Store to Support Center; provide auditing for terminated staff from Mi9 Store environment", completedDate: "", subtasks: [], tier: "project" },
  { id: 45, departments: ["Enterprise Systems"], name: "Price Change Tracking & Forecasting", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "4/22/2026", roadblocks: "IT Team bandwidth", milestones: "", nextSteps: "", notes: "Centralized price change tracking feeds: bin ticket printing, EZ-Commerce, TCB APIs, YODA, and Promo Management. Enables consistent pricing across all channels.", completedDate: "", subtasks: [], tier: "project" },
  { id: 46, departments: ["Enterprise Systems"], name: "Cookie Cutter Store Network Initiative", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "6/1/2026", roadblocks: "IT Team bandwidth", milestones: "", nextSteps: "", notes: "Standardize and template store networks and intranet sites for new store acquisitions beyond Store #244", completedDate: "", subtasks: [], tier: "project" },
  { id: 47, departments: ["Enterprise Systems"], name: "Price Ticket Generation Automation", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "6/8/2026", roadblocks: "Depends on completion of Price Change Tracking & Forecasting project", milestones: "", nextSteps: "", notes: "Fully automate price ticket generation sent to stores. Includes review of removing Bar Tender application from the technology stack.", completedDate: "", subtasks: [], tier: "project" },
  // Enterprise Systems ÃÂ¢ÃÂÃÂ Ongoing Support & Operations
  { id: 48, departments: ["Enterprise Systems"], name: "EDI Technical Support", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing operational support for EDI data exchange (OpenText / EricWare). Includes monitoring, troubleshooting, and documentation.", completedDate: "", subtasks: [], tier: "support" },
  { id: 49, departments: ["Enterprise Systems"], name: "Promotion Support", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Continuous support for promotion configuration, testing, and issue resolution within Mi9 Merchant, Ace, and the Marketing Dept.", completedDate: "", subtasks: [], tier: "support" },
  { id: 50, departments: ["Enterprise Systems"], name: "Mi9 Merchant Support", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Day-to-day support for Mi9 Merchant operations including upgrade coordination, break-fix, and vendor escalation.", completedDate: "", subtasks: [], tier: "support" },
  { id: 51, departments: ["Enterprise Systems"], name: "YODA Dashboard Development Support", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Continuous development and enhancement of Power BI dashboards sourced from Snowflake/YODA for store operations and management.", completedDate: "", subtasks: [], tier: "support" },
  { id: 52, departments: ["Enterprise Systems"], name: "Database Optimization, Movement & Troubleshooting", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing performance tuning, data migrations, and issue resolution across operational databases (MS SQL / MySQL / Snowflake)", completedDate: "", subtasks: [], tier: "support" },
  { id: 53, departments: ["Enterprise Systems"], name: "TorqueBot", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Proactive IT notification and process automation engine. Monitoring of systems and the trigger of alerts or automated responses.", completedDate: "", subtasks: [], tier: "support" },
  { id: 54, departments: ["Enterprise Systems"], name: "Toolbox Initiative", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Centralized, secure, role-based portal for internal tools and data collection forms.", completedDate: "", subtasks: [], tier: "support" },
  { id: 55, departments: ["Enterprise Systems"], name: "New Store / Acquisitions Support", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "End-to-end technical support for new stores and acquisitions: customer data loading, EPICOR Bridge integration, and full store setup in Mi9 ecosystem.", completedDate: "", subtasks: [], tier: "support" },
  { id: 56, departments: ["Enterprise Systems"], name: "Documenting EricWare", owner: "Dave Faucher", status: "In Progress", priority: "Low", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing documentation effort for EricWare systems, with emphasis on EDI processes.", completedDate: "", subtasks: [], tier: "support" },
  // Enterprise Systems ÃÂ¢ÃÂÃÂ Backlog
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
  // Enterprise Systems ÃÂ¢ÃÂÃÂ Recently Completed
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
  const initials = owner === "Unassigned" ? "?" : owner.split(" ").map(n => n[0]).join("");
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
  const parts = dateStr.split("/");
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
  const colCount = 7 + (showDepts ? 1 : 0) + (showOwner ? 1 : 0);

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
            {project.tier === "quickwin" && (<span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200"><Zap size={8} />QW</span>)}
            {project.tier === "support" && (<span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full border border-teal-200"><Headphones size={8} />Support</span>)}
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
          <td className="py-2.5 px-2"><OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} size="xs" ownerOptions={ownerOptions} onAddOwner={onAddOwner} /></td>
        )}
        <td className="py-2.5 px-2 w-32"><ProgressBar value={project.pct} onChange={(v) => onUpdate(project.id, "pct", v)} /></td>
        <td className="py-2.5 px-2 text-xs text-gray-500 whitespace-nowrap"><DatePicker value={project.date} onChange={(v) => onUpdate(project.id, "date", v)} /></td>
        <td className="py-2.5 px-2 text-[10px] text-gray-400 whitespace-nowrap">{project.lastUpdated || "--"}</td>
        <td className="py-2.5 px-2">
          <div className="flex items-center gap-1">
            <DeptMultiSelect selected={project.departments} onChange={(d) => onUpdate(project.id, "departments", d)} allDepartments={allDepartments} onAddDept={onAddDept} />
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
   VIEW: ALL PROJECTS (default -- flat project list)
   ===================================================================== */

function AllProjectsView({ projects, onUpdate, onDelete, onAdd, ownerOptions, onAddOwner, allDepartments, onAddDept }) {
  const reg=useMemo(()=>projects.filter(p=>p.tier!=="support"),[projects]);
  const sup=useMemo(()=>projects.filter(p=>p.tier==="support"),[projects]);
  const {sorted,sortField,sortDir,onSort}=useSortableProjects(reg);
  const {sorted:supSorted}=useSortableProjects(sup);
  const [supHide,setSupHide]=useState(false);
  const TH=()=>(<thead><tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider"><th className="py-2.5 px-3 w-8"></th><SortHeader label="Project" field="name" sortField={sortField} sortDir={sortDir} onSort={onSort} className="py-2.5 px-3"/><SortHeader label="Departments" field="departments" sortField={sortField} sortDir={sortDir} onSort={onSort}/><SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={onSort}/><SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={onSort}/><SortHeader label="Owner" field="owner" sortField={sortField} sortDir={sortDir} onSort={onSort}/><SortHeader label="Progress" field="pct" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-32"/><SortHeader label="Est. Completion" field="date" sortField={sortField} sortDir={sortDir} onSort={onSort}/><th className="py-2.5 px-2 text-left" style={{minWidth:80}}>Last Updated</th><th className="py-2.5 px-2 w-16"></th></tr></thead>);
  return (<div>
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full"><TH/><tbody>{sorted.map(p=><ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept}/>)}</tbody></table>
      <button onClick={()=>onAdd()} className="w-full text-left px-6 py-3 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100 flex items-center gap-2"><Plus size={12}/> Add project</button>
    </div>
    {sup.length>0&&(<div className="mt-6">
      <button onClick={()=>setSupHide(!supHide)} className="flex items-center gap-2 mb-3"><div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm"><Headphones size={14} className="text-white"/></div><h3 className="text-sm font-bold text-gray-700">Ongoing Support</h3><span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">{sup.length}</span>{supHide?<ChevronRight size={14} className="text-gray-400"/>:<ChevronDown size={14} className="text-gray-400"/>}</button>
      {!supHide&&(<div className="bg-white rounded-xl border border-teal-200 overflow-hidden"><table className="w-full"><TH/><tbody>{supSorted.map(p=><ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} ownerOptions={ownerOptions} onAddOwner={onAddOwner} allDepartments={allDepartments} onAddDept={onAddDept}/>)}</tbody></table><button onClick={()=>onAdd("support")} className="w-full text-left px-6 py-3 text-xs text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors border-t border-teal-100 flex items-center gap-2"><Plus size={12}/> Add support item</button></div>)}
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
        const initials = owner === "Unassigned" ? "?" : owner.split(" ").map(n => n[0]).join("");
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
        <div className="border-t border-gray-100">

          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-2 px-3 w-8"></th>
                <SortHeader label="Project" field="name" sortField={sortField} sortDir={sortDir} onSort={onSort} className="py-2 px-3" />
                <SortHeader label="Departments" field="departments" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Progress" field="pct" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-32" />
                <SortHeader label="Est. Completion" field="date" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th className="py-2 px-2 text-left" style={{minWidth:80}}>Last Updated</th>
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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="py-2 px-3 w-8"></th>
                    <SortHeader label="Project" field="name" sortField={sortField} sortDir={sortDir} onSort={onSort} className="py-2 px-3" />
                    <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Owner" field="owner" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Progress" field="pct" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-32" />
                    <SortHeader label="Est. Completion" field="date" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                    <th className="py-2 px-2 text-left" style={{minWidth:80}}>Last Updated</th>
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
   MAIN DASHBOARD
   ===================================================================== */

function ITProjectDashboard({ goHome }) {
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
  const [changeLog, setChangeLog] = useState([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [customOwners, setCustomOwners] = useState([]);
  const [customDepartments, setCustomDepartments] = useState([]);

  const allOwners = useMemo(() => [...OWNER_OPTIONS, ...customOwners.filter(o => !OWNER_OPTIONS.includes(o))], [customOwners]);
  const allDepartments = useMemo(() => [...DEPARTMENTS, ...customDepartments.filter(d => !DEPARTMENTS.includes(d))], [customDepartments]);

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
          if (d.projects) { const migrated=d.projects.map(p=>p.date==="Ongoing"&&p.tier!=="support"?{...p,tier:"support"}:p); setProjects(migrated); }
          if (d.inboxItems) setInboxItems(d.inboxItems);
          if (d.trashedProjects) setTrashedProjects(d.trashedProjects);
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
    const isSup=ownerOrNull==="support";
    const newP = {
      id: nextId,
      departments: deptOrNull?[deptOrNull]:["Enterprise Systems"],
      name: isSup?"New Support Item":"New Project",
      owner: (ownerOrNull&&ownerOrNull!=="support")?ownerOrNull:"Unassigned",
      status: isSup?"In Progress":"Not Started",
      priority: "Medium",
      pct: 0,
      date: isSup?"Ongoing":"",
      roadblocks: "",
      milestones: "",
      nextSteps: "",
      notes: "",
      completedDate: "",
      subtasks: [],
      tier: isSup?"support":"project",
      lastUpdated: new Date().toLocaleDateString("en-US")+" "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
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

  const handleUndoChange = useCallback((entry) => {
    if (!window.confirm(`Undo "${entry.field}" on "${entry.projectName}"? Revert to "${entry.oldValue}"?`)) return;
    const rv=entry.oldValue==="(empty)"?"":entry.oldValue;
    const fv=entry.field==="departments"?rv.split(", ").filter(Boolean):(entry.field==="pct"?Number(rv):rv);
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
              <button onClick={()=>setShowExportDialog(true)} className="flex items-center gap-1.5 bg-gray-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors shadow-sm"><Download size={13}/>Export</button>
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
        {alerts.length > 0 && activeView !== "history" && activeView !== "changelog" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-red-800">Critical Deadlines This Week</h4>
              <p className="text-xs text-red-600 mt-0.5">{alerts.map(p => `${p.name} (${p.owner})`).join("  |  ")} -- due 3/31/2026</p>
            </div>
          </div>
        )}

        {/* FILTERS */}
        {activeView !== "history" && activeView !== "changelog" && (
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
          <AllProjectsView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete} onAdd={(t)=>handleAddProject(t)} ownerOptions={allOwners} onAddOwner={handleAddOwner} allDepartments={allDepartments} onAddDept={handleAddDept} />
        )}

        {activeView === "owner" && (
          <ByOwnerView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete}
            onAdd={(owner) => handleAddProject(owner)} ownerOptions={allOwners} onAddOwner={handleAddOwner} allDepartments={allDepartments} onAddDept={handleAddDept} />
        )}

        {activeView === "dept" && (
          <ByDeptView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete}
            onAdd={(owner, dept) => handleAddProject(owner, dept)} ownerOptions={allOwners} onAddOwner={handleAddOwner} allDepartments={allDepartments} onAddDept={handleAddDept} />
        )}

        {activeView === "inbox" && (
          <InboxView inboxItems={inboxItems} setInboxItems={setInboxItems} onPromote={handlePromoteInbox} ownerOptions={allOwners} onAddOwner={handleAddOwner} />
        )}

        {activeView === "trash" && (
          <TrashView trashedProjects={trashedProjects} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} />
        )}

        {activeView === "history" && (<HistoryView completedProjects={completedProjects} onUpdate={handleUpdate} />)}

        {activeView === "changelog" && (<ChangeLogView changeLog={changeLog} onUndo={handleUndoChange} />)}

        {showExportDialog && (<ExportPDFDialog onClose={()=>setShowExportDialog(false)} projects={projects} stats={stats} alerts={alerts} completedProjects={completedProjects} changeLog={changeLog} ownerOptions={allOwners} />)}

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
    active: false,
  },
  {
    id: "payment-history",
    label: "Payment History",
    description: "View and filter all authorized payments ÃÂ¢ÃÂÃÂ AP invoices & CC expenses",
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
    label: "YODA",
    description: "Power BI analytics -- store performance, KPIs, and operational data",
    icon: Database,
    gradient: "from-emerald-500 to-emerald-700",
    hoverGradient: "from-emerald-600 to-emerald-800",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    shadow: "shadow-emerald-200/50",
    active: false,
  },
];

function HomeScreen({ onNavigate }) {
  const [apInvoiceCount, setApInvoiceCount] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "ap_invoices"));
        const pending = snap.docs.filter(d => (d.data().status || "pending") === "pending").length;
        setApInvoiceCount(pending);
      } catch (e) { /* silent */ }
    })();
  }, []);
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
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Scott's Workbench</h1>
                <p className="text-xs text-gray-400 mt-0.5">The Aubuchon Company</p>
              </div>
            </div>
            <button onClick={() => signOut(auth)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Tile Grid */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <p className="text-sm text-gray-500 mb-8 font-medium">Select a section to get started</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => section.active && onNavigate(section.id)}
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
    : inv.paymentDue || "ÃÂ¢ÃÂÃÂ";

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
      <span style={{ color: light ? "#6b7280" : "#111827", fontSize: ".78rem", fontWeight: 500, textAlign: "right" }}>{value || "ÃÂ¢ÃÂÃÂ"}</span>
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
            <span>ÃÂÃÂ·</span>
            <span>Store {inv.storeNumber}{inv.location ? ` ÃÂ¢ÃÂÃÂ ${inv.location}` : ""}</span>
            <span>ÃÂÃÂ·</span>
            <span>Vendor #{inv.vendorNumber}</span>
            {inv.docNumber && <><span>ÃÂÃÂ·</span><span style={{ color: "#9ca3af" }}>{inv.docNumber}</span></>}
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
              {decision && "ÃÂ¢ÃÂÃÂ³ "}
              {displayStatus === "approved" ? "ÃÂ¢ÃÂÃÂ Approved" : displayStatus === "rejected" ? "ÃÂ¢ÃÂÃÂ Rejected" : "Pending"}
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
          `Due: ${dueLabel}${overdue ? " ÃÂ¢ÃÂÃÂ OVERDUE ÃÂ¢ÃÂÃÂ " : ""}`,
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
              {panel === "preview" ? "ÃÂ°ÃÂÃÂÃÂ View Invoice" : "ÃÂ°ÃÂÃÂÃÂ Full Details"}
            </button>
          );
        })}
        {inv.jiffyUrl && (
          <a href={inv.jiffyUrl} target="_blank" rel="noopener noreferrer"
            style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", padding: "7px 14px", borderRadius: 6, fontSize: ".82rem", fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
            ÃÂ°ÃÂÃÂÃÂ Open in Jiffy
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
              Invoice image not available ÃÂ¢ÃÂÃÂ use "Open in Jiffy" to view original
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
              {detailRow("Project #", inv.projectNumber || "ÃÂ¢ÃÂÃÂ")}
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

      {/* Controls ÃÂ¢ÃÂÃÂ only show for pending invoices (not yet saved to Firestore) */}
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
              ÃÂ¢ÃÂÃÂ Approve
            </button>
            <button onClick={() => handleDecision("rejected")}
              style={{ background: decision?.action === "rejected" ? "#7f1d1d" : "#991b1b", color: "#fff", border: decision?.action === "rejected" ? "2px solid #dc2626" : "none", padding: "9px 20px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
              ÃÂ¢ÃÂÃÂ Reject
            </button>
            {decision && (
              <button onClick={() => onClearDecision(inv.id)}
                style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca", padding: "9px 14px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
                ÃÂ¢ÃÂÃÂ© Undo
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

  // Local-only ÃÂ¢ÃÂÃÂ updates batch decisions state (nothing saved to Firestore yet)
  const handleDecision = (invoiceId, action, category, comment) => {
    setDecisions(prev => ({ ...prev, [invoiceId]: { action, category, comment } }));
  };

  const clearDecision = (invoiceId) => {
    setDecisions(prev => { const next = { ...prev }; delete next[invoiceId]; return next; });
  };

  // Batch submit ÃÂ¢ÃÂÃÂ writes ALL decisions to Firestore and queues for Jiffy
  const submitAll = async () => {
    const entries = Object.entries(decisions);
    if (entries.length === 0) return;
    setSubmitting(true);
    try {
      for (const [invoiceId, { action, category, comment }] of entries) {
        await updateDoc(doc(db, "ap_invoices", invoiceId), {
          status: action, category, comment,
          actionedAt: serverTimestamp(),
          actionedBy: "scott@aubuchon.com",
          jiffyAction: "pending",
          jiffyGroup: category || "Expense in Budget",
        });
      }
      setInvoices(prev => prev.map(inv => {
        const d = decisions[inv.id];
        return d ? { ...inv, status: d.action, category: d.category, comment: d.comment, jiffyAction: "pending" } : inv;
      }));
      setDecisions({});
      alert(`Submitted ${entries.length} invoice${entries.length !== 1 ? "s" : ""} ÃÂ¢ÃÂÃÂ queued for Jiffy approval.`);
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
            <div style={{ fontSize: ".73rem", color: "#6b7280" }}>Aubuchon Hardware ÃÂ¢ÃÂÃÂ Accounts Payable</div>
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
        {loading && <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>Loading invoicesÃÂ¢ÃÂÃÂ¦</div>}
        {error && <div style={{ textAlign: "center", padding: "60px 0", color: "#dc2626" }}>Error: {error}</div>}

        {!loading && overdueCount > 0 && (
          <div style={{ background: "linear-gradient(90deg,#fef2f2,#fff5f5)", border: "1px solid #fecaca", color: "#991b1b", padding: "12px 20px", borderRadius: 10, marginBottom: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.2rem" }}>ÃÂ¢ÃÂÃÂ </span>
            <span>OVERDUE: {overdueCount} invoice{overdueCount !== 1 ? "s are" : " is"} past due ÃÂ¢ÃÂÃÂ immediate action recommended.</span>
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
              {" ÃÂÃÂ· "}
              {Object.values(decisions).filter(d => d.action === "rejected").length} rejected
              {" ÃÂÃÂ· "}
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
              {submitting ? "SubmittingÃÂ¢ÃÂÃÂ¦" : `Submit All (${Object.keys(decisions).length})`}
            </button>
          </div>
        </div>
      )}
    </div>
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
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    (async () => {
      try {
        // Load AP invoices
        const apSnap = await getDocs(collection(db, "ap_invoices"));
        const apRows = apSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            type: "AP",
            vendor: data.vendor || "ÃÂ¢ÃÂÃÂ",
            amount: Number(data.amount || 0),
            store: data.storeNumber || "",
            location: data.location || "",
            gl: data.glNumber || "",
            project: data.projectNumber || "",
            dueDate: data.paymentDue || "",
            invoiceDate: data.invoiceDate || "",
            status: data.status || "pending",
            description: data.description || data.remarks || "",
            group: data.invoiceGroup || data.category || "ÃÂ¢ÃÂÃÂ",
            invoiceNumber: data.invoiceNumber || "",
            actionedAt: data.actionedAt || null,
          };
        });

        // Future: Load CC expenses
        // const ccSnap = await getDocs(collection(db, "cc_expenses"));
        // const ccRows = ccSnap.docs.map(d => { ... type: "CC" ... });

        setRows([...apRows /*, ...ccRows */]);
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
    return d && !isNaN(d) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : (val || "ÃÂ¢ÃÂÃÂ");
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

  const sortIcon = (col) => sortCol === col ? (sortDir === "asc" ? " ÃÂ¢ÃÂÃÂ²" : " ÃÂ¢ÃÂÃÂ¼") : "";

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
            <div style={{ fontSize: ".73rem", color: "#6b7280" }}>All authorized payments ÃÂ¢ÃÂÃÂ AP Invoices & CC Expenses</div>
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

        {loading && <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>Loading payment historyÃÂ¢ÃÂÃÂ¦</div>}

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
                      { key: "store", label: "Store / Location", w: 130 },
                      { key: "gl", label: "GL #", w: 110 },
                      { key: "project", label: "Project #", w: 80 },
                      { key: "date", label: "Due Date", w: 100 },
                      { key: "status", label: "Status", w: 90 },
                      { key: "desc", label: "Description", w: 180 },
                      { key: "group", label: "Group", w: 100 },
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
                    <tr><td colSpan={10} style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>No records match the current filters.</td></tr>
                  )}
                  {sorted.map((r, idx) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px" }}>{typeBadge(r.type)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{r.vendor}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#0f766e", fontVariantNumeric: "tabular-nums" }}>{fmt(r.amount)}</td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{r.store}{r.location ? ` ÃÂ¢ÃÂÃÂ ${r.location}` : ""}</td>
                      <td style={{ padding: "10px 12px", color: "#4338ca", fontFamily: "monospace", fontSize: ".78rem" }}>{r.gl || "ÃÂ¢ÃÂÃÂ"}</td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{r.project || "ÃÂ¢ÃÂÃÂ"}</td>
                      <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap" }}>{fmtDate(r.dueDate)}</td>
                      <td style={{ padding: "10px 12px" }}>{statusBadge(r.status)}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description || "ÃÂ¢ÃÂÃÂ"}</td>
                      <td style={{ padding: "10px 12px", color: "#374151", fontSize: ".78rem" }}>{r.group || "ÃÂ¢ÃÂÃÂ"}</td>
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

export default function App() {
  const [activeSection, setActiveSection] = useState(null);

  if (activeSection === "projects") {
    return <ITProjectDashboard goHome={() => setActiveSection(null)} />;
  }

  if (activeSection === "ap-invoices") return <APInvoices goHome={() => setActiveSection(null)} goHistory={() => setActiveSection("payment-history")} />;

  if (activeSection === "payment-history") return <PaymentHistory goHome={() => setActiveSection(null)} goBack={() => setActiveSection(null)} />;

  // Future sections:
  // if (activeSection === "wells-cc") return <WellsCC goHome={() => setActiveSection(null)} goHistory={() => setActiveSection("payment-history")} />;
  // if (activeSection === "yoda") return <YODADashboard goHome={() => setActiveSection(null)} />;

  return <HomeScreen onNavigate={setActiveSection} />;
}

