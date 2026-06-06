const STORAGE_KEY = "autoattend-platform-v1";
const SESSION_KEY = "autoattend-session-v1";

const DEFAULT_DATA = {
  company: {
    name: "Muslim Solutions",
    defaultSchedule: "08:00 - 17:00",
    graceMinutes: 10,
    gpsAccuracyLimit: 45,
    workDays: ["Sun", "Mon", "Tue", "Wed", "Thu"],
    language: "English",
  },
  departments: [
    { id: "operations", name: "Operations", active: true },
    { id: "people", name: "People", active: true },
    { id: "engineering", name: "Engineering", active: true },
  ],
  roles: [
    { id: "field-operations", name: "Field operations", departmentId: "operations", active: true },
    { id: "hr-specialist", name: "HR specialist", departmentId: "people", active: true },
    { id: "site-engineer", name: "Site engineer", departmentId: "engineering", active: true },
    { id: "operations-lead", name: "Operations lead", departmentId: "operations", active: true },
  ],
  users: [
    { id: "u-admin", employeeId: null, name: "System Admin", email: "admin@attendence.local", password: "attendence", role: "admin", active: true },
    { id: "u-0001", employeeId: "0001", name: "Muslim Alramadan", email: "employee@attendence.local", password: "attendence", role: "employee", active: true },
  ],
  locations: [
    { id: "riyadh-hq", name: "Riyadh HQ", city: "Riyadh", type: "Office", lat: 24.7136, lng: 46.6753, radius: 420, schedule: "08:00 - 17:00", active: true },
    { id: "jeddah-site", name: "Jeddah Site A", city: "Jeddah", type: "Field site", lat: 21.5433, lng: 39.1728, radius: 520, schedule: "07:30 - 16:30", active: true },
    { id: "dammam-ops", name: "Dammam Operations", city: "Dammam", type: "Operations", lat: 26.4207, lng: 50.0888, radius: 460, schedule: "08:00 - 17:00", active: true },
  ],
  employees: [
    { id: "0001", name: "Muslim Alramadan", roleId: "field-operations", departmentId: "operations", manager: "System Admin", zones: ["riyadh-hq", "jeddah-site"], status: "Available", active: true },
    { id: "0002", name: "Sara Saleh", roleId: "hr-specialist", departmentId: "people", manager: "System Admin", zones: ["riyadh-hq"], status: "Available", active: true },
    { id: "0003", name: "Khalid Nasser", roleId: "site-engineer", departmentId: "engineering", manager: "System Admin", zones: ["jeddah-site"], status: "Available", active: true },
    { id: "0004", name: "Maha Fahad", roleId: "operations-lead", departmentId: "operations", manager: "System Admin", zones: ["dammam-ops"], status: "Available", active: true },
  ],
  attendance: [
    { id: "att-1", employeeId: "0001", locationId: "riyadh-hq", checkIn: todayAt("08:05"), checkOut: todayAt("11:42"), durationMinutes: 217, status: "Approved", accuracy: 18, distance: 16, source: "GPS", note: "" },
    { id: "att-2", employeeId: "0002", locationId: "riyadh-hq", checkIn: todayAt("07:58"), checkOut: null, durationMinutes: null, status: "Inside", accuracy: 22, distance: 12, source: "GPS", note: "" },
    { id: "att-3", employeeId: "0004", locationId: "dammam-ops", checkIn: todayAt("08:21"), checkOut: null, durationMinutes: null, status: "Late", accuracy: 29, distance: 21, source: "GPS", note: "" },
  ],
  requests: [
    { id: "EX-104", employeeId: "0001", type: "Late arrival", date: todayISO(), reason: "Client meeting delayed site arrival.", attachment: "", status: "Pending", adminNote: "", history: [{ at: nowISO(), by: "Muslim Alramadan", action: "Submitted" }] },
    { id: "EX-103", employeeId: "0003", type: "GPS issue", date: offsetISO(-1), reason: "Weak GPS signal inside warehouse.", attachment: "", status: "Approved", adminNote: "Accepted with site lead confirmation.", history: [{ at: offsetISO(-1), by: "System Admin", action: "Approved" }] },
  ],
  audit: [
    { id: "log-1", at: nowISO(), actor: "System", action: "Workspace initialized", entity: "Platform", detail: "Default production-ready dataset created." },
  ],
};

const navLabels = {
  overview: "Overview",
  locations: "Locations & zones",
  employees: "Employees",
  logs: "Attendance logs",
  reports: "Reports",
  settings: "Settings",
};

const app = {
  route: "login",
  adminPanel: "overview",
  session: readSession(),
  data: loadData(),
  selectedEmployeeId: "",
  geofenceLocationId: "riyadh-hq",
  locationMapMode: "all",
  filters: { logs: "", reportFrom: offsetISO(-7), reportTo: todayISO() },
};

let activeMap = null;
let geofenceMarker = null;
let geofenceCircle = null;
let employeeMarker = null;
let mapResizeObserver = null;

const view = document.querySelector("#view");
const themeToggle = document.querySelector("#theme-toggle");
const headerSession = document.querySelector("#header-session");
const headerLogout = document.querySelector("#header-logout");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function offsetISO(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayAt(time) {
  return `${todayISO()}T${time}:00`;
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed ? mergeDefaults(parsed) : structuredClone(DEFAULT_DATA);
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function mergeDefaults(data) {
  const merged = {
    ...structuredClone(DEFAULT_DATA),
    ...data,
    company: { ...DEFAULT_DATA.company, ...(data.company || {}) },
    departments: data.departments || DEFAULT_DATA.departments,
    roles: data.roles || DEFAULT_DATA.roles,
    users: data.users || DEFAULT_DATA.users,
    locations: data.locations || DEFAULT_DATA.locations,
    employees: data.employees || DEFAULT_DATA.employees,
    attendance: data.attendance || DEFAULT_DATA.attendance,
    requests: data.requests || DEFAULT_DATA.requests,
    audit: data.audit || DEFAULT_DATA.audit,
  };
  merged.employees = merged.employees.map((employee) => normalizeEmployee(employee, merged));
  return merged;
}

function normalizeEmployee(employee, data = DEFAULT_DATA) {
  const departmentId = employee.departmentId || slugFromName(employee.department || "operations");
  const roleId = employee.roleId || slugFromName(employee.role || "field-operations");
  return { ...employee, departmentId, roleId };
}

function saveData(action, entity, detail) {
  if (action) {
    app.data.audit.unshift({ id: uid("audit"), at: nowISO(), actor: currentUser()?.name || "Guest", action, entity, detail });
    app.data.audit = app.data.audit.slice(0, 150);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.data));
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function setSession(session) {
  app.session = session;
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

function currentUser() {
  return app.data.users.find((user) => user.id === app.session?.userId) || null;
}

function currentEmployee() {
  const user = currentUser();
  const employeeId = user?.role === "employee" ? user.employeeId : app.selectedEmployeeId;
  return app.data.employees.find((employee) => employee.id === employeeId) || app.data.employees[0];
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function slugFromName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || uid("item");
}

function departmentName(id) {
  return app.data.departments.find((department) => department.id === id)?.name || id || "Unassigned";
}

function roleName(id) {
  return app.data.roles.find((role) => role.id === id)?.name || id || "Unassigned";
}

function activeDepartments() {
  return app.data.departments.filter((department) => department.active);
}

function activeRoles() {
  return app.data.roles.filter((role) => role.active);
}

function nextEmployeeId() {
  const highest = app.data.employees.reduce((max, employee) => {
    const value = Number(employee.id);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return String(highest + 1).padStart(4, "0");
}

function formatDateTime(value) {
  if (!value) return "Active";
  return new Intl.DateTimeFormat("en-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "Active";
  return new Intl.DateTimeFormat("en-SA", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMinutes(minutes) {
  if (minutes == null) return "Running";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

function minutesSinceMidnight(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesFromISO(value) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function scheduleStart(location) {
  return (location?.schedule || app.data.company.defaultSchedule).split("-")[0].trim();
}

function evaluateAttendance(location, at, accuracy, distance) {
  if (!location) return { status: "Outside", reason: "No approved zone matched." };
  if (accuracy > Number(app.data.company.gpsAccuracyLimit)) return { status: "Review", reason: `GPS accuracy ${Math.round(accuracy)}m exceeds policy.` };
  if (distance > Number(location.radius)) return { status: "Outside", reason: `${distance}m away from ${location.name}.` };
  const lateAfter = minutesSinceMidnight(scheduleStart(location)) + Number(app.data.company.graceMinutes);
  return minutesFromISO(at) > lateAfter ? { status: "Late", reason: "Checked in after grace period." } : { status: "Inside", reason: "Inside approved zone." };
}

function activeSession(employeeId) {
  return app.data.attendance.find((item) => item.employeeId === employeeId && !item.checkOut);
}

function employeeSessions(employeeId) {
  return app.data.attendance.filter((item) => item.employeeId === employeeId).sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
}

function employeeName(id) {
  return app.data.employees.find((employee) => employee.id === id)?.name || id;
}

function locationName(id) {
  return app.data.locations.find((location) => location.id === id)?.name || "Unknown zone";
}

function employeeAllowedLocations(employee) {
  return app.data.locations.filter((location) => employee?.zones?.includes(location.id) && location.active);
}

function nearestAllowedLocation(employee, coords) {
  return employeeAllowedLocations(employee)
    .map((location) => ({ location, distance: distanceMeters(coords, location) }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function router() {
  const [route, panel] = (location.hash.replace("#/", "") || "login").split("/");
  app.route = route;
  if (route === "admin" && panel) app.adminPanel = panel;
  destroyMap();
  protectRoute();
  updateHeader();
  if (app.route === "admin") renderAdmin();
  else if (app.route === "employee") renderEmployee();
  else renderLogin();
}

function protectRoute() {
  const user = currentUser();
  if (user && app.route === "login") {
    app.route = user.role === "admin" ? "admin" : "employee";
    location.hash = user.role === "admin" ? "#/admin" : "#/employee";
    return;
  }
  if (!user && app.route !== "login") {
    app.route = "login";
    location.hash = "#/login";
    return;
  }
  if (app.route === "admin" && user?.role !== "admin") {
    app.route = "employee";
    location.hash = "#/employee";
  }
}

function updateHeader() {
  const user = currentUser();
  if (!headerSession || !headerLogout) return;
  headerSession.hidden = !user;
  headerLogout.hidden = !user;
  headerSession.innerHTML = user ? `<strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.role)}</span>` : "";
}

function renderLogin() {
  updateHeader();
  view.innerHTML = `
    <section class="login-page">
      <div class="login-showcase login-brand-panel">
        <img src="assets/AutoAttend.png" alt="AutoAttend logo" />
        <span class="eyebrow">Workforce attendance platform</span>
        <h1>AutoAttend</h1>
        <p>Secure attendance operations for branches, field teams, approvals, reports, and policy-based work schedules.</p>
        <div class="login-feature-list">
          <div><strong>Role based access</strong><span>Admins and employees enter separate workspaces automatically.</span></div>
          <div><strong>GPS attendance rules</strong><span>Check-in decisions follow approved zones and accuracy policy.</span></div>
          <div><strong>Audit-ready records</strong><span>Every operational action is tracked for review and payroll.</span></div>
        </div>
      </div>
      <form class="login-panel" id="login-form">
        <span class="eyebrow">Secure sign in</span>
        <h1>Enter your workspace.</h1>
        <p>Your account determines whether you open the admin console or employee portal.</p>
        <label>Work email <input name="email" type="email" value="admin@attendence.local" autocomplete="email" required /></label>
        <label>Password <input name="password" type="password" value="attendence" autocomplete="current-password" required /></label>
        <button class="btn primary" type="submit">Enter workspace</button>
      </form>
    </section>
  `;
  view.querySelector("#login-form").addEventListener("submit", login);
}

function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = String(form.get("email")).trim().toLowerCase();
  const password = String(form.get("password"));
  const user = app.data.users.find((item) => item.email.toLowerCase() === email && item.password === password && item.active);
  if (!user) return toast("Invalid credentials or inactive account.");
  setSession({ userId: user.id, signedInAt: nowISO() });
  saveData("Signed in", "Auth", user.email);
  location.hash = user.role === "admin" ? "#/admin" : "#/employee";
}

function logout() {
  saveData("Signed out", "Auth", currentUser()?.email || "Unknown");
  setSession(null);
  updateHeader();
  location.hash = "#/login";
}

function renderAdmin() {
  view.innerHTML = `
    <section class="workspace">
      <aside class="sidebar">
        <span class="sidebar-label">Workspace</span>
        <div class="nav-list">${Object.keys(navLabels).map(navButton).join("")}</div>
      </aside>
      <section class="content"><div id="admin-content"></div></section>
    </section>
  `;
  view.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      app.adminPanel = button.dataset.panel;
      history.replaceState(null, "", `#/admin/${app.adminPanel}`);
      destroyMap();
      renderAdmin();
    });
  });
  renderAdminPanel();
}

function navButton(panel) {
  return `<button class="nav-item ${app.adminPanel === panel ? "active" : ""}" data-panel="${panel}" type="button">${navLabels[panel]}</button>`;
}

function renderAdminPanel() {
  const panel = document.querySelector("#admin-content");
  if (app.adminPanel === "locations") renderLocations(panel);
  else if (app.adminPanel === "employees") renderEmployees(panel);
  else if (app.adminPanel === "logs") renderLogs(panel);
  else if (app.adminPanel === "reports") renderReports(panel);
  else if (app.adminPanel === "settings") renderSettings(panel);
  else renderOverview(panel);
}

function pageHead(eyebrow, title, actions = "") {
  return `
    <div class="page-head">
      <div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1></div>
      <div class="header-actions">
        ${actions}
      </div>
    </div>
  `;
}

function bindLogout(scope = document) {
  return scope;
}

function metric(label, value, note, tone = "") {
  return `<article class="metric ${tone}"><small>${label}</small><strong>${value}</strong><p>${note}</p></article>`;
}

function renderOverview(panel) {
  const open = app.data.attendance.filter((item) => !item.checkOut);
  const late = app.data.attendance.filter((item) => sameDay(item.checkIn, todayISO()) && item.status === "Late");
  const risks = riskItems();
  panel.innerHTML = `
    ${pageHead("Admin control center", "Today across every branch and field zone.", `<button class="btn primary" data-panel-jump="employees">Add employee</button>`)}
    <div class="metrics">
      ${metric("Open sessions", open.length, "Employees currently checked in")}
      ${metric("Late arrivals", late.length, "Needs supervisor review", late.length ? "warn-card" : "")}
      ${metric("Pending requests", pendingRequests().length, "Awaiting admin decision")}
      ${metric("Risk signals", risks.length, "Smart attendance checks", risks.length ? "warn-card" : "")}
    </div>
    <section class="panel overview-map-panel">
      <div class="section-head"><div><span class="eyebrow">Live map</span><h2>Active zones</h2></div></div>
      <div id="admin-overview-map" class="map-canvas overview-map"></div>
    </section>
    <div class="grid-2">
      <section class="table-card">
        <div class="section-head"><div><span class="eyebrow">Smart risk center</span><h2>Operational exceptions</h2></div></div>
        <div class="list">${risks.map(renderRisk).join("") || emptyState("No high-risk signals right now.")}</div>
      </section>
      <section class="table-card">
        <div class="section-head"><div><span class="eyebrow">Requests</span><h2>Approvals inbox</h2></div></div>
        <div class="list">${app.data.requests.slice(0, 5).map(renderRequestAdmin).join("") || emptyState("No requests submitted.")}</div>
      </section>
    </div>
  `;
  bindLogout(panel);
  panel.querySelector("[data-panel-jump]").addEventListener("click", () => {
    app.adminPanel = "employees";
    renderAdmin();
  });
  bindRequestActions(panel);
  setTimeout(() => initMap("admin-overview-map", { zoom: 5, center: [24.5, 45.8] }), 60);
}

function riskItems() {
  const risks = [];
  app.data.attendance.forEach((item) => {
    const location = app.data.locations.find((zone) => zone.id === item.locationId);
    if (!item.checkOut && hoursBetween(item.checkIn, nowISO()) > 10) risks.push({ tone: "warn", title: `${employeeName(item.employeeId)} has a long open session`, detail: "Open for more than 10 hours. Confirm checkout." });
    if (item.accuracy > Number(app.data.company.gpsAccuracyLimit)) risks.push({ tone: "bad", title: `${employeeName(item.employeeId)} used weak GPS accuracy`, detail: `${item.accuracy}m accuracy exceeds policy.` });
    if (location && item.distance > location.radius) risks.push({ tone: "bad", title: `${employeeName(item.employeeId)} checked from outside ${location.name}`, detail: `${item.distance}m from zone center.` });
    if (item.status === "Late") risks.push({ tone: "warn", title: `${employeeName(item.employeeId)} was late`, detail: `Checked in at ${formatTime(item.checkIn)}.` });
  });
  return risks.slice(0, 8);
}

function renderRisk(risk) {
  return `<article class="record"><div class="row-between"><div><h3>${escapeHtml(risk.title)}</h3><p>${escapeHtml(risk.detail)}</p></div><span class="chip ${risk.tone}">${risk.tone === "bad" ? "High" : "Review"}</span></div></article>`;
}

function renderLocations(panel) {
  const selected = app.data.locations.find((location) => location.id === app.geofenceLocationId) || app.data.locations[0];
  app.geofenceLocationId = selected.id;
  const editing = app.locationMapMode === "edit";
  panel.innerHTML = `
    ${pageHead("Locations & zones", "Manage approved work zones, schedules, radius, and status.", `<button class="btn primary" id="add-location" type="button">New zone</button>`)}
    <section class="geofence-product">
      <div class="geofence-map-side">
        <div class="section-head">
          <div><h2>${editing ? escapeHtml(selected.name) : "All active zones"}</h2><p>${editing ? "Drag the pin, click the map, adjust the radius, then save." : "All active branches are visible together. Open a zone to edit its details."}</p></div>
          <strong id="radius-label">${selected.radius}m radius</strong>
        </div>
        <div class="geofence-map-wrap">
          <div id="locations-map" class="map-canvas geofence-map"></div>
          <div class="map-actions">
            <button class="btn" id="toggle-location-map" type="button">${editing ? "Show all zones" : "Edit selected"}</button>
            <button class="btn" id="geo-fit" type="button">${editing ? "Fit zone" : "Fit all"}</button>
            ${editing ? `<button class="btn" id="geo-current" type="button">Use current</button>` : ""}
          </div>
          <div class="radius-badge">${selected.radius}m radius</div>
        </div>
      </div>
      <aside class="geofence-controls">
        <div class="save-state saved" id="geo-save-state">Saved</div>
        <label>Selected zone <select id="zone-select">${app.data.locations.map((location) => `<option value="${location.id}" ${location.id === selected.id ? "selected" : ""}>${escapeHtml(location.name)}</option>`).join("")}</select></label>
        <label>Zone name <input id="geo-name" value="${escapeHtml(selected.name)}" /></label>
        <div class="form-grid">
          <label>City <input id="geo-city" value="${escapeHtml(selected.city)}" /></label>
          <label>Type <input id="geo-type" value="${escapeHtml(selected.type)}" /></label>
          <label>Schedule <input id="geo-schedule" value="${escapeHtml(selected.schedule)}" /></label>
          <label>Status <select id="geo-active"><option value="true" ${selected.active ? "selected" : ""}>Active</option><option value="false" ${!selected.active ? "selected" : ""}>Inactive</option></select></label>
        </div>
        <label>Allowed radius (m)</label>
        <div class="radius-row">
          <input id="geo-radius" type="range" min="100" max="1500" step="25" value="${selected.radius}" />
          <input id="geo-radius-value" value="${selected.radius}" />
        </div>
        <details class="advanced-box" open>
          <summary>Coordinates</summary>
          <div class="form-grid">
            <label>Latitude <input id="geo-lat" value="${selected.lat.toFixed(5)}" /></label>
            <label>Longitude <input id="geo-lng" value="${selected.lng.toFixed(5)}" /></label>
          </div>
        </details>
        <div class="inline-actions">
          <button class="btn primary" id="geo-save" type="button">Save zone</button>
          <button class="btn danger" id="delete-zone" type="button">Delete</button>
        </div>
        <h3 class="list-title">All zones</h3>
        <div class="list compact-list">${app.data.locations.map(renderLocationRecord).join("")}</div>
      </aside>
    </section>
  `;
  bindLogout(panel);
  wireGeofenceControls(panel, selected);
  panel.querySelector("#add-location").addEventListener("click", addLocation);
  panel.querySelectorAll("[data-select-zone]").forEach((button) => button.addEventListener("click", () => {
    app.geofenceLocationId = button.dataset.selectZone;
    app.locationMapMode = "edit";
    renderAdmin();
  }));
  setTimeout(() => initMap("locations-map", editing ? { zoom: 16, center: [selected.lat, selected.lng], geofence: true, location: selected } : { zoom: 5, center: [24.2, 45.6] }), 60);
}

function renderLocationRecord(location) {
  return `
    <article class="record ${location.id === app.geofenceLocationId ? "selected-record" : ""}">
      <div class="row-between">
        <div><h3>${escapeHtml(location.name)}</h3><p>${escapeHtml(location.city)} - ${escapeHtml(location.type)} - ${escapeHtml(location.schedule)}</p></div>
        <button class="btn" data-select-zone="${location.id}" type="button">Open</button>
      </div>
      <div class="chips"><span class="chip">${location.radius}m</span><span class="chip ${location.active ? "good" : "bad"}">${location.active ? "Active" : "Inactive"}</span></div>
    </article>
  `;
}

function wireGeofenceControls(panel, location) {
  const controls = {
    select: panel.querySelector("#zone-select"),
    name: panel.querySelector("#geo-name"),
    city: panel.querySelector("#geo-city"),
    type: panel.querySelector("#geo-type"),
    schedule: panel.querySelector("#geo-schedule"),
    active: panel.querySelector("#geo-active"),
    radius: panel.querySelector("#geo-radius"),
    radiusValue: panel.querySelector("#geo-radius-value"),
    lat: panel.querySelector("#geo-lat"),
    lng: panel.querySelector("#geo-lng"),
    saveState: panel.querySelector("#geo-save-state"),
  };
  const markUnsaved = () => {
    controls.saveState.textContent = "Unsaved changes";
    controls.saveState.classList.remove("saved");
    controls.saveState.classList.add("unsaved");
  };
  controls.select.addEventListener("change", () => {
    app.geofenceLocationId = controls.select.value;
    renderAdmin();
  });
  const updateRadius = (value) => {
    location.radius = Math.max(100, Number(value) || 100);
    controls.radius.value = location.radius;
    controls.radiusValue.value = location.radius;
    panel.querySelector("#radius-label").textContent = `${location.radius}m radius`;
    panel.querySelector(".radius-badge").textContent = `${location.radius}m radius`;
    updateGeofenceSource(location);
    markUnsaved();
  };
  controls.radius.addEventListener("input", (event) => updateRadius(event.target.value));
  controls.radiusValue.addEventListener("change", (event) => updateRadius(event.target.value));
  [controls.name, controls.city, controls.type, controls.schedule, controls.active].forEach((input) => input.addEventListener("change", markUnsaved));
  [controls.lat, controls.lng].forEach((input) => input.addEventListener("change", () => {
    setGeofenceCenter(location, Number(controls.lat.value), Number(controls.lng.value));
    markUnsaved();
  }));
  panel.querySelector("#geo-current")?.addEventListener("click", () => getBrowserPosition((position) => {
    setGeofenceCenter(location, position.coords.latitude, position.coords.longitude);
    app.locationMapMode = "edit";
    markUnsaved();
  }));
  panel.querySelector("#geo-fit").addEventListener("click", () => {
    if (app.locationMapMode === "edit") fitGeofence();
    else fitAllZones();
  });
  panel.querySelector("#toggle-location-map").addEventListener("click", () => {
    app.locationMapMode = app.locationMapMode === "edit" ? "all" : "edit";
    renderAdmin();
  });
  panel.querySelector("#geo-save").addEventListener("click", () => {
    location.name = controls.name.value.trim() || location.name;
    location.city = controls.city.value.trim() || location.city;
    location.type = controls.type.value.trim() || location.type;
    location.schedule = controls.schedule.value.trim() || location.schedule;
    location.active = controls.active.value === "true";
    location.lat = Number(controls.lat.value) || location.lat;
    location.lng = Number(controls.lng.value) || location.lng;
    saveData("Updated zone", "Location", location.name);
    toast("Zone saved.");
    renderAdmin();
  });
  panel.querySelector("#delete-zone").addEventListener("click", () => deleteLocation(location.id));
}

function addLocation() {
  const count = app.data.locations.length + 1;
  const location = { id: uid("zone"), name: `New Zone ${count}`, city: "Riyadh", type: "Temporary", lat: 24.74 + count / 100, lng: 46.69 + count / 100, radius: 300, schedule: app.data.company.defaultSchedule, active: true };
  app.data.locations.push(location);
  app.geofenceLocationId = location.id;
  app.locationMapMode = "edit";
  saveData("Created zone", "Location", location.name);
  toast("Zone created.");
  renderAdmin();
}

function deleteLocation(id) {
  const used = app.data.employees.some((employee) => employee.zones.includes(id)) || app.data.attendance.some((item) => item.locationId === id);
  if (used) return toast("Zone is linked to employees or attendance records.");
  app.data.locations = app.data.locations.filter((location) => location.id !== id);
  app.geofenceLocationId = app.data.locations[0]?.id;
  saveData("Deleted zone", "Location", id);
  renderAdmin();
}

function renderEmployees(panel) {
  panel.innerHTML = `
    ${pageHead("Employees", "Manage employee access, assignments, and account status.", `<button class="btn" id="export-employees">Export CSV</button>`)}
    <div class="grid-2">
      <form class="form-card" id="employee-form">
        <div class="section-head"><div><span class="eyebrow">Directory</span><h2>Add employee</h2></div></div>
        <div class="form-grid">
          <label>Next ID <input value="${nextEmployeeId()}" disabled /></label>
          <label>Name <input name="name" placeholder="Employee name" required /></label>
          <label>Department <select name="departmentId" required>${activeDepartments().map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join("")}</select></label>
          <label>Role <select name="roleId" required>${activeRoles().map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join("")}</select></label>
          <label class="wide">Allowed zones <select name="zones" multiple size="3">${app.data.locations.map((location) => `<option value="${location.id}">${escapeHtml(location.name)}</option>`).join("")}</select></label>
          <label>Email <input name="email" type="email" placeholder="employee@company.com" /></label>
        </div>
        <div class="inline-actions stack-top"><button class="btn primary" type="submit">Create employee</button></div>
      </form>
      <section class="table-card">
        <div class="section-head">
          <div><span class="eyebrow">Search</span><h2>Employee list</h2></div>
          <input class="compact-input" id="employee-search" placeholder="Search employees" />
        </div>
        <div class="list" id="employee-list">${app.data.employees.map(renderEmployeeRecord).join("")}</div>
      </section>
    </div>
  `;
  bindLogout(panel);
  panel.querySelector("#employee-form").addEventListener("submit", addEmployee);
  panel.querySelector("#employee-search").addEventListener("input", (event) => renderEmployeeList(panel, event.target.value));
  panel.querySelector("#export-employees").addEventListener("click", () => exportCsv("employees.csv", ["ID", "Name", "Role", "Department", "Status"], app.data.employees.map((e) => [e.id, e.name, roleName(e.roleId), departmentName(e.departmentId), e.active ? "Active" : "Inactive"])));
  bindEmployeeActions(panel);
}

function renderEmployeeList(panel, query) {
  const q = query.trim().toLowerCase();
  const rows = app.data.employees.filter((employee) => [employee.id, employee.name, roleName(employee.roleId), departmentName(employee.departmentId)].join(" ").toLowerCase().includes(q));
  panel.querySelector("#employee-list").innerHTML = rows.map(renderEmployeeRecord).join("") || emptyState("No employees match this search.");
  bindEmployeeActions(panel);
}

function renderEmployeeRecord(employee) {
  const sessions = employeeSessions(employee.id);
  const open = activeSession(employee.id);
  const zones = employee.zones.map(locationName).join(", ") || "No zones";
  return `
    <article class="record">
      <div class="row-between">
        <div><h3>${employee.id} - ${escapeHtml(employee.name)}</h3><p>${escapeHtml(roleName(employee.roleId))} - ${escapeHtml(departmentName(employee.departmentId))} - ${escapeHtml(zones)}</p></div>
        <div class="inline-actions">
          <button class="btn" data-employee-profile="${employee.id}" type="button">Profile</button>
          <button class="btn ${employee.active ? "danger" : ""}" data-toggle-employee="${employee.id}" type="button">${employee.active ? "Disable" : "Enable"}</button>
        </div>
      </div>
      <div class="chips">
        <span class="chip ${employee.active ? "good" : "bad"}">${employee.active ? "Active" : "Inactive"}</span>
        <span class="chip ${open ? "good" : ""}">${open ? "Checked in" : "Outside"}</span>
        <span class="chip">${sessions.length} records</span>
      </div>
    </article>
  `;
}

function bindEmployeeActions(scope) {
  scope.querySelectorAll("[data-toggle-employee]").forEach((button) => button.addEventListener("click", () => {
    const employee = app.data.employees.find((item) => item.id === button.dataset.toggleEmployee);
    employee.active = !employee.active;
    saveData(employee.active ? "Enabled employee" : "Disabled employee", "Employee", employee.name);
    renderAdmin();
  }));
  scope.querySelectorAll("[data-employee-profile]").forEach((button) => button.addEventListener("click", () => {
    app.selectedEmployeeId = button.dataset.employeeProfile;
    app.adminPanel = "logs";
    renderAdmin();
  }));
}

function addEmployee(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = nextEmployeeId();
  const zones = form.getAll("zones");
  if (app.data.employees.some((employee) => employee.id === id)) return toast("Employee ID already exists.");
  const role = app.data.roles.find((item) => item.id === form.get("roleId"));
  const employee = {
    id,
    name: String(form.get("name")).trim(),
    roleId: String(form.get("roleId")),
    departmentId: String(form.get("departmentId") || role?.departmentId || ""),
    manager: currentUser()?.name || "Admin",
    zones: zones.length ? zones : [app.data.locations[0]?.id].filter(Boolean),
    status: "Available",
    active: true,
  };
  app.data.employees.push(employee);
  const email = String(form.get("email")).trim();
  if (email) app.data.users.push({ id: uid("user"), employeeId: id, name: employee.name, email, password: "attendence", role: "employee", active: true });
  saveData("Created employee", "Employee", employee.name);
  toast("Employee created.");
  renderAdmin();
}

function renderLogs(panel) {
  const employees = [`<option value="">All employees</option>`, ...app.data.employees.map((e) => `<option value="${e.id}" ${app.selectedEmployeeId === e.id ? "selected" : ""}>${e.id} - ${escapeHtml(e.name)}</option>`)].join("");
  const rows = filteredAttendance();
  panel.innerHTML = `
    ${pageHead("Attendance logs", "Every check-in, checkout, correction, and exception.", `<button class="btn" id="export-report">Export CSV</button>`)}
    <section class="table-card">
      <div class="section-head">
        <div><span class="eyebrow">Filters</span><h2>Audit-ready records</h2></div>
        <div class="inline-actions filter-row">
          <select id="employee-filter">${employees}</select>
          <input id="text-filter" placeholder="Search status, zone, note" value="${escapeHtml(app.filters.logs)}" />
        </div>
      </div>
      <div class="table-wrap">${attendanceTable(rows)}</div>
    </section>
    <section class="table-card stack-top">
      <div class="section-head"><div><span class="eyebrow">Manual correction</span><h2>Admin adjustment</h2></div></div>
      <form class="form-grid" id="manual-correction">
        <label>Employee <select name="employeeId">${app.data.employees.map((e) => `<option value="${e.id}">${e.id} - ${escapeHtml(e.name)}</option>`).join("")}</select></label>
        <label>Zone <select name="locationId">${app.data.locations.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join("")}</select></label>
        <label>Check in <input name="checkIn" type="datetime-local" required /></label>
        <label>Check out <input name="checkOut" type="datetime-local" /></label>
        <label class="wide">Reason <textarea name="note" placeholder="Required reason for audit trail." required></textarea></label>
        <button class="btn primary" type="submit">Add correction</button>
      </form>
    </section>
  `;
  bindLogout(panel);
  panel.querySelector("#employee-filter").addEventListener("change", (event) => {
    app.selectedEmployeeId = event.target.value;
    renderAdmin();
  });
  panel.querySelector("#text-filter").addEventListener("input", (event) => {
    app.filters.logs = event.target.value;
    panel.querySelector(".table-wrap").innerHTML = attendanceTable(filteredAttendance());
  });
  panel.querySelector("#export-report").addEventListener("click", () => exportCsv("attendance-report.csv", ["Employee", "Zone", "Check in", "Check out", "Duration", "Status", "Accuracy", "Distance", "Note"], filteredAttendance().map(attendanceExportRow)));
  panel.querySelector("#manual-correction").addEventListener("submit", addManualCorrection);
}

function filteredAttendance() {
  const q = app.filters.logs.toLowerCase();
  return app.data.attendance
    .filter((item) => !app.selectedEmployeeId || item.employeeId === app.selectedEmployeeId)
    .filter((item) => [employeeName(item.employeeId), locationName(item.locationId), item.status, item.note].join(" ").toLowerCase().includes(q))
    .sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
}

function attendanceTable(rows) {
  if (!rows.length) return emptyState("No attendance records found.");
  return `
    <table>
      <thead><tr><th>Employee</th><th>Zone</th><th>Check in</th><th>Check out</th><th>Duration</th><th>Status</th><th>GPS</th></tr></thead>
      <tbody>${rows.map((item) => `
        <tr>
          <td>${escapeHtml(employeeName(item.employeeId))}</td>
          <td>${escapeHtml(locationName(item.locationId))}</td>
          <td>${formatDateTime(item.checkIn)}</td>
          <td>${formatDateTime(item.checkOut)}</td>
          <td>${formatMinutes(item.durationMinutes)}</td>
          <td><span class="chip ${statusTone(item.status)}">${item.status}</span></td>
          <td>${item.accuracy}m / ${item.distance}m</td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function attendanceExportRow(item) {
  return [employeeName(item.employeeId), locationName(item.locationId), formatDateTime(item.checkIn), formatDateTime(item.checkOut), formatMinutes(item.durationMinutes), item.status, `${item.accuracy}m`, `${item.distance}m`, item.note || ""];
}

function addManualCorrection(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const checkIn = new Date(String(form.get("checkIn"))).toISOString();
  const checkOutValue = String(form.get("checkOut"));
  const checkOut = checkOutValue ? new Date(checkOutValue).toISOString() : null;
  const durationMinutes = checkOut ? Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 60000)) : null;
  app.data.attendance.unshift({
    id: uid("att"),
    employeeId: form.get("employeeId"),
    locationId: form.get("locationId"),
    checkIn,
    checkOut,
    durationMinutes,
    status: "Manual",
    accuracy: 0,
    distance: 0,
    source: "Admin",
    note: String(form.get("note")).trim(),
  });
  saveData("Added manual correction", "Attendance", employeeName(form.get("employeeId")));
  toast("Correction saved with audit trail.");
  renderAdmin();
}

function renderReports(panel) {
  const rows = app.data.attendance.filter((item) => inRange(item.checkIn, app.filters.reportFrom, app.filters.reportTo));
  const totalMinutes = rows.reduce((sum, item) => sum + (item.durationMinutes || runningMinutes(item)), 0);
  const byZone = app.data.locations.map((location) => {
    const zoneRows = rows.filter((item) => item.locationId === location.id);
    return { location, minutes: zoneRows.reduce((sum, item) => sum + (item.durationMinutes || runningMinutes(item)), 0), late: zoneRows.filter((item) => item.status === "Late").length };
  });
  panel.innerHTML = `
    ${pageHead("Reports", "Payroll-ready insight by employee, branch, and exception.", `<button class="btn" id="export-summary">Export summary</button>`)}
    <section class="table-card">
      <div class="section-head">
        <div><span class="eyebrow">Period</span><h2>Report range</h2></div>
        <div class="inline-actions filter-row">
          <input id="report-from" type="date" value="${app.filters.reportFrom}" />
          <input id="report-to" type="date" value="${app.filters.reportTo}" />
        </div>
      </div>
    </section>
    <div class="grid-3 stack-top">
      ${metric("Total hours", formatMinutes(totalMinutes), "All employees in range")}
      ${metric("Compliance", `${compliance(rows)}%`, "Approved or inside records")}
      ${metric("Exceptions", rows.filter((item) => ["Late", "Review", "Outside", "Manual"].includes(item.status)).length, "Needs review")}
    </div>
    <section class="table-card stack-top">
      <div class="section-head"><div><span class="eyebrow">Breakdown</span><h2>Zone utilization</h2></div></div>
      <div class="list">${byZone.map((row) => `<div class="record"><h3>${escapeHtml(row.location.name)}</h3><p>${escapeHtml(row.location.city)} - ${escapeHtml(row.location.type)}</p><div class="chips"><span class="chip good">${formatMinutes(row.minutes)}</span><span class="chip ${row.late ? "warn" : ""}">${row.late} late</span><span class="chip">${row.location.radius}m radius</span></div></div>`).join("")}</div>
    </section>
  `;
  bindLogout(panel);
  panel.querySelector("#report-from").addEventListener("change", (event) => {
    app.filters.reportFrom = event.target.value;
    renderAdmin();
  });
  panel.querySelector("#report-to").addEventListener("change", (event) => {
    app.filters.reportTo = event.target.value;
    renderAdmin();
  });
  panel.querySelector("#export-summary").addEventListener("click", () => exportCsv("report-summary.csv", ["Zone", "Hours", "Late"], byZone.map((row) => [row.location.name, formatMinutes(row.minutes), row.late])));
}

function renderSettings(panel) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  panel.innerHTML = `
    ${pageHead("Settings", "Company rules, GPS quality, roles, and audit controls.", `<button class="btn danger" id="reset-demo" type="button">Reset data</button>`)}
    <div class="grid-3">
      <form class="form-card" id="policy-form">
        <h2>Attendance policy</h2>
        <label>Grace period minutes <input name="graceMinutes" type="number" min="0" value="${app.data.company.graceMinutes}" /></label>
        <label>GPS accuracy limit meters <input name="gpsAccuracyLimit" type="number" min="5" value="${app.data.company.gpsAccuracyLimit}" /></label>
        <button class="btn primary stack-top" type="submit">Save policy</button>
      </form>
      <form class="form-card" id="company-form">
        <h2>Company profile</h2>
        <label>Company name <input name="name" value="${escapeHtml(app.data.company.name)}" /></label>
        <label>Default schedule <input name="defaultSchedule" value="${escapeHtml(app.data.company.defaultSchedule)}" /></label>
        <div class="settings-checks">
          <span>Work days</span>
          ${days.map((day) => `<label><input type="checkbox" name="workDays" value="${day}" ${app.data.company.workDays.includes(day) ? "checked" : ""} /> ${day}</label>`).join("")}
        </div>
        <button class="btn primary stack-top" type="submit">Save company</button>
      </form>
      <form class="form-card" id="department-form">
        <h2>Departments</h2>
        <label>New department <input name="name" placeholder="Department name" required /></label>
        <button class="btn primary stack-top" type="submit">Add department</button>
        <div class="chips stack-top">${app.data.departments.map((department) => `<span class="chip ${department.active ? "good" : "bad"}">${escapeHtml(department.name)}</span>`).join("")}</div>
      </form>
    </div>
    <div class="grid-2 stack-top">
      <form class="form-card" id="role-form">
        <h2>Roles</h2>
        <div class="form-grid">
          <label>Role name <input name="name" placeholder="Role name" required /></label>
          <label>Department <select name="departmentId">${activeDepartments().map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join("")}</select></label>
        </div>
        <button class="btn primary stack-top" type="submit">Add role</button>
        <div class="list compact-list stack-top">${app.data.roles.map((role) => `<article class="record"><h3>${escapeHtml(role.name)}</h3><p>${escapeHtml(departmentName(role.departmentId))}</p><div class="chips"><span class="chip ${role.active ? "good" : "bad"}">${role.active ? "Active" : "Inactive"}</span></div></article>`).join("")}</div>
      </form>
      <section class="form-card">
        <h2>Security model</h2>
        <p>Access is role-based. Admins manage the workspace; employees can only see their own portal and requests.</p>
        <div class="chips stack-top"><span class="chip good">Admin</span><span class="chip">Employee</span><span class="chip">Audit log</span></div>
      </section>
    </div>
    <section class="table-card stack-top">
      <div class="section-head"><div><span class="eyebrow">Audit</span><h2>Recent system activity</h2></div></div>
      <div class="list compact-list">${app.data.audit.slice(0, 20).map((item) => `<article class="record"><h3>${escapeHtml(item.action)} - ${escapeHtml(item.entity)}</h3><p>${formatDateTime(item.at)} by ${escapeHtml(item.actor)}. ${escapeHtml(item.detail)}</p></article>`).join("")}</div>
    </section>
  `;
  bindLogout(panel);
  panel.querySelector("#policy-form").addEventListener("submit", savePolicy);
  panel.querySelector("#company-form").addEventListener("submit", saveCompany);
  panel.querySelector("#department-form").addEventListener("submit", addDepartment);
  panel.querySelector("#role-form").addEventListener("submit", addRole);
  panel.querySelector("#reset-demo").addEventListener("click", resetData);
}

function savePolicy(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  app.data.company.graceMinutes = Number(form.get("graceMinutes"));
  app.data.company.gpsAccuracyLimit = Number(form.get("gpsAccuracyLimit"));
  saveData("Updated policy", "Settings", "Attendance rules changed.");
  toast("Policy saved.");
  renderAdmin();
}

function saveCompany(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  app.data.company.name = String(form.get("name")).trim() || app.data.company.name;
  app.data.company.defaultSchedule = String(form.get("defaultSchedule")).trim() || app.data.company.defaultSchedule;
  const workDays = form.getAll("workDays");
  app.data.company.workDays = workDays.length ? workDays : app.data.company.workDays;
  saveData("Updated company profile", "Settings", app.data.company.name);
  toast("Company profile saved.");
  renderAdmin();
}

function addDepartment(event) {
  event.preventDefault();
  const name = String(new FormData(event.currentTarget).get("name")).trim();
  if (!name) return;
  const id = slugFromName(name);
  if (app.data.departments.some((department) => department.id === id)) return toast("Department already exists.");
  app.data.departments.push({ id, name, active: true });
  saveData("Created department", "Settings", name);
  toast("Department added.");
  renderAdmin();
}

function addRole(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name")).trim();
  if (!name) return;
  const id = slugFromName(name);
  if (app.data.roles.some((role) => role.id === id)) return toast("Role already exists.");
  app.data.roles.push({ id, name, departmentId: String(form.get("departmentId")), active: true });
  saveData("Created role", "Settings", name);
  toast("Role added.");
  renderAdmin();
}

function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  app.data = structuredClone(DEFAULT_DATA);
  saveData("Reset workspace data", "Settings", "Default dataset restored.");
  toast("Workspace reset.");
  renderAdmin();
}

function renderEmployee() {
  const employee = currentEmployee();
  const session = activeSession(employee.id);
  const ownRequests = app.data.requests.filter((request) => request.employeeId === employee.id);
  const sessions = employeeSessions(employee.id);
  const allowed = employeeAllowedLocations(employee);
  view.innerHTML = `
    <section class="employee-layout">
      ${pageHead("Employee portal", "Today follows your approved zones.", "")}
      <div class="employee-hero">
        <section class="employee-summary">
          <div class="profile"><div class="avatar">${initials(employee.name)}</div><div><h2>${escapeHtml(employee.name)}</h2><p>ID ${employee.id} - ${escapeHtml(roleName(employee.roleId))}</p></div></div>
          <div class="status-pill ${session ? "good" : ""}" id="employee-status">${session ? `Checked in at ${locationName(session.locationId)}` : "Ready for check-in"}</div>
          <div class="summary-grid">
            <div class="summary-cell"><small>Current state</small><strong>${session ? "Inside" : "Outside"}</strong></div>
            <div class="summary-cell"><small>Records today</small><strong>${sessions.filter((item) => sameDay(item.checkIn, todayISO())).length}</strong></div>
            <div class="summary-cell"><small>Total today</small><strong>${formatMinutes(todayMinutes(employee.id))}</strong></div>
            <div class="summary-cell"><small>Approved zones</small><strong>${allowed.length}</strong></div>
          </div>
          <div class="workday-card">
            <small>Working days</small>
            <strong>${app.data.company.workDays.join(", ")}</strong>
            <p>${escapeHtml(app.data.company.defaultSchedule)} default schedule</p>
          </div>
          <div class="inline-actions stack-top">
            <button class="btn primary" id="attendance-action" type="button">${session ? "Check out" : "Check in"}</button>
            <button class="btn" id="show-excuse-form" type="button">Submit request</button>
          </div>
          <div class="gps-readiness" id="gps-readiness">GPS will be validated before attendance is saved.</div>
        </section>
        <section class="panel"><div id="employee-map" class="map-canvas"></div></section>
      </div>
      <div class="grid-2">
        <section class="table-card">
          <div class="section-head"><div><span class="eyebrow">Timeline</span><h2>My attendance</h2></div></div>
          <div class="table-wrap">${attendanceTable(sessions)}</div>
        </section>
        <section class="table-card">
          <div class="section-head"><div><span class="eyebrow">Requests</span><h2>My approvals</h2></div></div>
          <div id="request-form-slot"></div>
          <div class="list">${ownRequests.map(renderRequestEmployee).join("") || emptyState("No requests submitted.")}</div>
        </section>
      </div>
    </section>
  `;
  bindLogout(view);
  view.querySelector("#attendance-action").addEventListener("click", () => handleAttendance(employee));
  view.querySelector("#show-excuse-form").addEventListener("click", showRequestForm);
  setTimeout(() => initMap("employee-map", { zoom: 13, center: allowed[0] ? [allowed[0].lat, allowed[0].lng] : [24.7136, 46.6753], employee }), 60);
}

function handleAttendance(employee) {
  const session = activeSession(employee.id);
  if (session) return checkout(employee, session);
  getBrowserPosition((position) => checkin(employee, position), () => {
    const location = employeeAllowedLocations(employee)[0];
    const fakePosition = { coords: { latitude: location.lat, longitude: location.lng, accuracy: 18 } };
    toast("Browser GPS unavailable. Using approved-zone fallback for this local deployment.");
    checkin(employee, fakePosition);
  });
}

function checkin(employee, position) {
  const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
  const nearest = nearestAllowedLocation(employee, coords);
  const at = nowISO();
  const accuracy = Math.round(position.coords.accuracy || 999);
  const location = nearest?.location;
  const distance = nearest?.distance ?? 999999;
  const result = evaluateAttendance(location, at, accuracy, distance);
  const record = {
    id: uid("att"),
    employeeId: employee.id,
    locationId: location?.id || employee.zones[0],
    checkIn: at,
    checkOut: null,
    durationMinutes: null,
    status: result.status,
    accuracy,
    distance,
    source: "GPS",
    note: result.reason,
  };
  if (result.status === "Outside") {
    toast(result.reason);
    return;
  }
  app.data.attendance.unshift(record);
  saveData("Checked in", "Attendance", `${employee.name} - ${result.reason}`);
  toast(`Checked in: ${result.reason}`);
  renderEmployee();
}

function checkout(employee, session) {
  const out = nowISO();
  session.checkOut = out;
  session.durationMinutes = Math.max(0, Math.round((new Date(out) - new Date(session.checkIn)) / 60000));
  session.status = session.status === "Inside" ? "Approved" : session.status;
  saveData("Checked out", "Attendance", `${employee.name} - ${formatMinutes(session.durationMinutes)}`);
  toast("Checkout saved.");
  renderEmployee();
}

function showRequestForm() {
  const slot = document.querySelector("#request-form-slot");
  slot.innerHTML = `
    <form class="form-card request-form" id="request-form">
      <div class="form-grid">
        <label>Type <select name="type"><option>Late arrival</option><option>Absence</option><option>Early checkout</option><option>GPS issue</option><option>Manual correction</option></select></label>
        <label>Date <input name="date" type="date" value="${todayISO()}" /></label>
        <label class="wide">Attachment link <input name="attachment" placeholder="Optional file/link reference" /></label>
        <label class="wide">Reason <textarea name="reason" placeholder="Write a clear reason for admin review." required></textarea></label>
      </div>
      <div class="inline-actions stack-top"><button class="btn primary" type="submit">Submit request</button></div>
    </form>
  `;
  slot.querySelector("#request-form").addEventListener("submit", submitRequest);
}

function submitRequest(event) {
  event.preventDefault();
  const employee = currentEmployee();
  const form = new FormData(event.currentTarget);
  const request = {
    id: `EX-${Math.floor(100 + Math.random() * 900)}`,
    employeeId: employee.id,
    type: form.get("type"),
    date: form.get("date"),
    reason: String(form.get("reason")).trim(),
    attachment: String(form.get("attachment")).trim(),
    status: "Pending",
    adminNote: "",
    history: [{ at: nowISO(), by: employee.name, action: "Submitted" }],
  };
  app.data.requests.unshift(request);
  saveData("Submitted request", "Request", `${employee.name} - ${request.type}`);
  toast("Request sent to admin.");
  renderEmployee();
}

function renderRequestAdmin(request) {
  const employee = employeeName(request.employeeId);
  const actions = request.status === "Pending" ? `<div class="inline-actions"><button class="btn primary" data-approve="${request.id}" type="button">Approve</button><button class="btn danger" data-reject="${request.id}" type="button">Reject</button><button class="btn" data-info="${request.id}" type="button">Need info</button></div>` : "";
  return `
    <article class="record">
      <h3>${escapeHtml(employee)} - ${escapeHtml(request.type)}</h3>
      <p>${escapeHtml(request.reason)}</p>
      <div class="chips"><span class="chip ${statusTone(request.status)}">${request.status}</span><span class="chip">${request.date}</span>${request.attachment ? `<span class="chip">Attachment</span>` : ""}</div>
      ${request.adminNote ? `<p class="stack-top">${escapeHtml(request.adminNote)}</p>` : ""}
      ${actions}
    </article>
  `;
}

function renderRequestEmployee(request) {
  return `
    <article class="record">
      <h3>${escapeHtml(request.type)}</h3>
      <p>${escapeHtml(request.reason)}</p>
      <div class="chips"><span class="chip ${statusTone(request.status)}">${request.status}</span><span class="chip">${request.date}</span></div>
      ${request.adminNote ? `<p class="stack-top">${escapeHtml(request.adminNote)}</p>` : ""}
    </article>
  `;
}

function bindRequestActions(scope) {
  scope.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", () => decideRequest(button.dataset.approve, "Approved")));
  scope.querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", () => decideRequest(button.dataset.reject, "Rejected")));
  scope.querySelectorAll("[data-info]").forEach((button) => button.addEventListener("click", () => decideRequest(button.dataset.info, "Needs Info")));
}

function decideRequest(id, status) {
  const request = app.data.requests.find((item) => item.id === id);
  if (!request) return;
  request.status = status;
  request.adminNote = status === "Approved" ? "Approved by admin. Exception is ready for payroll review." : status === "Rejected" ? "Rejected by admin. Please contact HR for details." : "More information is required before approval.";
  request.history.push({ at: nowISO(), by: currentUser()?.name || "Admin", action: status });
  saveData(`${status} request`, "Request", request.id);
  toast(`Request ${status.toLowerCase()}.`);
  renderAdmin();
}

function pendingRequests() {
  return app.data.requests.filter((request) => request.status === "Pending");
}

function initTheme() {
  const saved = localStorage.getItem("attendence-theme") || "dark";
  document.body.classList.toggle("light", saved === "light");
  themeToggle.textContent = saved === "light" ? "Dark" : "Light";
  applyMapTheme();
  themeToggle.addEventListener("click", () => {
    const light = !document.body.classList.contains("light");
    document.body.classList.toggle("light", light);
    localStorage.setItem("attendence-theme", light ? "light" : "dark");
    themeToggle.textContent = light ? "Dark" : "Light";
    applyMapTheme();
    scheduleMapResize();
  });
}

function initMap(id, options) {
  const node = document.querySelector(`#${id}`);
  if (!node) return;
  destroyMap();
  node.replaceChildren();
  if (!window.L) return showMapLoadState(node);
  activeMap = L.map(node, {
    zoomControl: true,
    preferCanvas: true,
    fadeAnimation: false,
    zoomAnimation: false,
    markerZoomAnimation: false,
  }).setView(options.center, options.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    className: "map-tile",
    tileSize: 256,
    maxZoom: 19,
    keepBuffer: 2,
    updateWhenIdle: true,
    updateWhenZooming: false,
    updateInterval: 180,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(activeMap);
  applyMapTheme();
  document.querySelector("#login-fallback")?.remove();
  if (options.geofence) addGeofenceEditor(activeMap, options.location);
  else app.data.locations.filter((location) => location.active).forEach((location) => addZone(activeMap, location));
  if (options.employee) addEmployeeLayer(activeMap, options.employee);
  if (!options.geofence) fitAllZones();
  observeMapSize(node);
  scheduleMapResize();
}

function destroyMap() {
  if (mapResizeObserver) {
    mapResizeObserver.disconnect();
    mapResizeObserver = null;
  }
  if (activeMap) {
    const map = activeMap;
    activeMap = null;
    map.stop();
    map.off();
    map.eachLayer((layer) => {
      layer.off?.();
      map.removeLayer(layer);
    });
    map.remove();
  }
  geofenceMarker = null;
  geofenceCircle = null;
  employeeMarker = null;
}

function addZone(map, location) {
  L.circle([location.lat, location.lng], { radius: location.radius, color: "#28d7d1", weight: 3, fillColor: "#28d7d1", fillOpacity: 0.11 }).addTo(map);
  L.marker([location.lat, location.lng], { icon: companyMarkerIcon(location.name) })
    .addTo(map)
    .bindPopup(`<strong>${escapeHtml(location.name)}</strong><br>${escapeHtml(location.city)} - ${escapeHtml(location.type)}<br>${escapeHtml(location.schedule)}<br>${location.radius}m zone`);
}

function addEmployeeLayer(map, employee) {
  employeeAllowedLocations(employee).forEach((location) => addZone(map, location));
  const session = activeSession(employee.id);
  const location = app.data.locations.find((zone) => zone.id === session?.locationId) || employeeAllowedLocations(employee)[0];
  if (!location) return;
  employeeMarker = L.marker([location.lat, location.lng], { icon: companyMarkerIcon(employee.name) })
    .addTo(map)
    .bindPopup(`<strong>${escapeHtml(employee.name)}</strong><br>${session ? "Checked in" : "Ready for check-in"}`);
}

function addGeofenceEditor(map, location) {
  geofenceCircle = L.circle([location.lat, location.lng], { radius: location.radius, color: "#28d7d1", weight: 3, fillColor: "#28d7d1", fillOpacity: 0.12 }).addTo(map);
  geofenceMarker = L.marker([location.lat, location.lng], { draggable: true, icon: companyMarkerIcon(location.name) })
    .addTo(map)
    .bindPopup(`<strong>${escapeHtml(location.name)}</strong><br>Drag or click map to set location.`);
  geofenceMarker.on("dragend", () => {
    const point = geofenceMarker.getLatLng();
    setGeofenceCenter(location, point.lat, point.lng, false);
  });
  map.on("click", (event) => setGeofenceCenter(location, event.latlng.lat, event.latlng.lng));
  map.setView([location.lat, location.lng], 16);
}

function setGeofenceCenter(location, lat, lng, moveMap = true) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  location.lat = lat;
  location.lng = lng;
  geofenceMarker?.setLatLng([lat, lng]);
  updateGeofenceSource(location);
  const latInput = document.querySelector("#geo-lat");
  const lngInput = document.querySelector("#geo-lng");
  if (latInput) latInput.value = lat.toFixed(5);
  if (lngInput) lngInput.value = lng.toFixed(5);
  markLocationUnsaved();
  if (moveMap) activeMap?.flyTo([lat, lng], 16, { duration: 0.5 });
}

function updateGeofenceSource(location) {
  if (!geofenceCircle) return;
  geofenceCircle.setLatLng([location.lat, location.lng]);
  geofenceCircle.setRadius(location.radius);
}

function fitGeofence() {
  if (!activeMap || !geofenceCircle) return;
  activeMap.fitBounds(geofenceCircle.getBounds().pad(0.25), { maxZoom: 16 });
  scheduleMapResize();
}

function fitAllZones() {
  if (!activeMap || !app.data.locations.length) return;
  const bounds = L.latLngBounds(app.data.locations.filter((location) => location.active).map((location) => [location.lat, location.lng]));
  if (bounds.isValid()) activeMap.fitBounds(bounds.pad(0.25), { maxZoom: 13 });
}

function companyMarkerIcon(name) {
  return L.divIcon({
    className: "company-marker",
    html: `<span class="company-marker-pin"></span><span class="company-marker-label">${escapeHtml(name)}</span>`,
    iconSize: [150, 42],
    iconAnchor: [18, 36],
  });
}

function observeMapSize(node) {
  if (!window.ResizeObserver) return;
  mapResizeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) activeMap?.invalidateSize(false);
  });
  mapResizeObserver.observe(node);
}

function applyMapTheme() {
  const light = document.body.classList.contains("light");
  document.querySelectorAll(".leaflet-container").forEach((map) => {
    map.classList.toggle("map-theme-light", light);
    map.classList.toggle("map-theme-dark", !light);
  });
}

function scheduleMapResize() {
  const resize = () => activeMap?.invalidateSize(true);
  requestAnimationFrame(() => requestAnimationFrame(resize));
  [80, 220, 480].forEach((delay) => setTimeout(resize, delay));
}

function showMapLoadState(node, message = "Leaflet and OpenStreetMap are loading. No access token is required.") {
  document.querySelector("#login-fallback")?.remove();
  node.innerHTML = `<div class="map-load-state"><div class="map-load-card"><span class="eyebrow">OpenStreetMap</span><h2>Map loading</h2><p>${message}</p><div class="chips"><span class="chip good">No token</span><span class="chip">Leaflet</span><span class="chip">OpenStreetMap</span></div></div></div>`;
}

function getBrowserPosition(success, failure) {
  if (!navigator.geolocation) {
    failure?.();
    return;
  }
  navigator.geolocation.getCurrentPosition(success, () => failure?.(), { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 });
}

function markLocationUnsaved() {
  const saveState = document.querySelector("#geo-save-state");
  if (!saveState) return;
  saveState.textContent = "Unsaved changes";
  saveState.classList.remove("saved");
  saveState.classList.add("unsaved");
}

function statusTone(status) {
  if (["Approved", "Inside", "Active"].includes(status)) return "good";
  if (["Late", "Pending", "Review", "Needs Info", "Manual"].includes(status)) return "warn";
  if (["Rejected", "Outside", "Inactive"].includes(status)) return "bad";
  return "";
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function sameDay(value, isoDate) {
  return value?.slice(0, 10) === isoDate;
}

function inRange(value, from, to) {
  const date = value.slice(0, 10);
  return date >= from && date <= to;
}

function runningMinutes(item) {
  const end = item.checkOut ? new Date(item.checkOut) : new Date();
  return Math.max(0, Math.round((end - new Date(item.checkIn)) / 60000));
}

function todayMinutes(employeeId) {
  return app.data.attendance
    .filter((item) => item.employeeId === employeeId && sameDay(item.checkIn, todayISO()))
    .reduce((sum, item) => sum + (item.durationMinutes || runningMinutes(item)), 0);
}

function hoursBetween(start, end) {
  return (new Date(end) - new Date(start)) / 3600000;
}

function compliance(rows) {
  if (!rows.length) return 100;
  const compliant = rows.filter((item) => ["Approved", "Inside"].includes(item.status)).length;
  return Math.round((compliant / rows.length) * 100);
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function exportCsv(filename, header, rows) {
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2400);
}

initTheme();
headerLogout?.addEventListener("click", logout);
window.addEventListener("hashchange", router);
router();
