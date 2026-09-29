"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  Download,
  ExternalLink,
  LogOut,
  Monitor,
  Pencil,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  TabletSmartphone,
  Undo2,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { downloadCsv } from "@/lib/csv";
import { confirmationLabel, formatDateTime, normaliseText, statusLabel, tableLabel } from "@/lib/format";
import { hasSupabaseConfig, supabase } from "@/lib/supabaseClient";

const PROGRAMME_URL =
  "https://www.tvawales.org.uk/web/content/3696?unique=a3c76b86fb5669f9bb86ffb4eb71d8ec696c1c28&download=true";

const DEVICE_ID_KEY = "tcva-awards-2026-device-id";
const DEVICE_LABEL_KEY = "tcva-awards-2026-device-label";

function getDeviceId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

function getDeviceLabel() {
  if (typeof window === "undefined") return "Device";
  const existing = window.localStorage.getItem(DEVICE_LABEL_KEY);
  if (existing) return existing;
  const fallback = /iPad|Tablet|Android/i.test(navigator.userAgent) ? "Tablet" : "Laptop";
  window.localStorage.setItem(DEVICE_LABEL_KEY, fallback);
  return fallback;
}

function sortByTable(a, b) {
  const at = Number(a?.event_tables?.table_number || 9999);
  const bt = Number(b?.event_tables?.table_number || 9999);
  if (at !== bt) return at - bt;
  return (a.seat_sort_order || 9999) - (b.seat_sort_order || 9999) || a.full_name.localeCompare(b.full_name);
}

function StatusPill({ status }) {
  return <span className={`pill pill-${status}`}>{statusLabel(status)}</span>;
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <ClipboardList size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export default function CheckInApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [viewMode, setViewMode] = useState("tablet");
  const [activeOpsTab, setActiveOpsTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [editGuest, setEditGuest] = useState(null);
  const [undoReason, setUndoReason] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Device");
  const [data, setData] = useState({
    guests: [],
    tables: [],
    parties: [],
    assets: [],
    feedbackLinks: [],
    attendanceEvents: [],
    auditLog: [],
    dashboard: null,
    categories: [],
    tableSummary: [],
  });
  const [assetUrl, setAssetUrl] = useState(PROGRAMME_URL);
  const [feedbackUrl, setFeedbackUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const deviceId = useMemo(() => getDeviceId(), []);

  useEffect(() => {
    setDeviceLabel(getDeviceLabel());
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: sessionData }) => {
      setSession(sessionData.session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setData((current) => ({ ...current, guests: [] }));
      return;
    }
    loadProfileAndData();
  }, [session]);

  useEffect(() => {
    if (!profile?.active) return undefined;
    const refresh = () => loadAllData(false);
    const channel = supabase
      .channel("tcva-awards-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_tables" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "guest_parties" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, refresh)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile?.active]);

  async function loadProfileAndData() {
    setLoading(true);
    setError("");
    const { data: profileData, error: profileError } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    setProfile(profileData);
    if (profileData?.active) {
      await loadAllData(false);
    }
    setLoading(false);
  }

  async function loadAllData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError("");

    const guestSelect = `
      *,
      event_tables(id, table_number, table_label, capacity, is_vip),
      guest_parties(id, party_code, party_name, lead_guest_name, organisation_name)
    `;

    const [
      guestsResult,
      tablesResult,
      partiesResult,
      assetsResult,
      feedbackResult,
      dashboardResult,
      categoriesResult,
      tableSummaryResult,
      eventsResult,
      auditResult,
    ] = await Promise.all([
      supabase.from("guests").select(guestSelect).order("full_name"),
      supabase.from("event_tables").select("*").order("display_order").order("table_number"),
      supabase.from("guest_parties").select("*").order("party_name"),
      supabase.from("event_assets").select("*").order("display_order"),
      supabase.from("feedback_links").select("*").order("display_order"),
      supabase.from("dashboard_attendance_summary").select("*").maybeSingle(),
      supabase.from("category_attendance_summary").select("*").order("award_category"),
      supabase.from("table_attendance_summary").select("*"),
      supabase.from("attendance_events").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

    const firstError = [
      guestsResult,
      tablesResult,
      partiesResult,
      assetsResult,
      feedbackResult,
      dashboardResult,
      categoriesResult,
      tableSummaryResult,
      eventsResult,
      auditResult,
    ].find((result) => result.error)?.error;

    if (firstError) {
      setError(firstError.message);
      if (showSpinner) setLoading(false);
      return;
    }

    const programme = assetsResult.data?.find((asset) => asset.asset_key === "programme_pdf");
    const feedback = feedbackResult.data?.find((link) => link.active);

    setAssetUrl(programme?.url || PROGRAMME_URL);
    setFeedbackUrl(feedback?.url || "");
    setData({
      guests: guestsResult.data || [],
      tables: tablesResult.data || [],
      parties: partiesResult.data || [],
      assets: assetsResult.data || [],
      feedbackLinks: feedbackResult.data || [],
      attendanceEvents: eventsResult.data || [],
      auditLog: auditResult.data || [],
      dashboard: dashboardResult.data || null,
      categories: categoriesResult.data || [],
      tableSummary: tableSummaryResult.data || [],
    });

    if (showSpinner) setLoading(false);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const { error: authError } =
      authMode === "sign-up"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    else setMessage(authMode === "sign-up" ? "Account created. Check your inbox if email confirmation is enabled." : "Signed in.");
    setLoading(false);
  }

  async function claimFirstAdmin() {
    setError("");
    setMessage("");
    setLoading(true);
    const { data: claimedProfile, error: claimError } = await supabase.rpc("claim_first_admin", {
      p_full_name: fullName || session.user.email,
    });
    if (claimError) setError(claimError.message);
    else {
      setProfile(claimedProfile);
      setMessage("First admin account activated.");
      await loadAllData(false);
    }
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  async function recordAttendance(guest, action, reason = null) {
    setBusyId(guest.id);
    setError("");
    const { error: actionError } = await supabase.rpc("record_attendance_action", {
      p_guest_id: guest.id,
      p_action: action,
      p_reason: reason,
      p_device_id: deviceId,
      p_device_label: deviceLabel,
      p_metadata: { source: viewMode },
    });
    if (actionError) setError(actionError.message);
    else {
      setUndoReason("");
      await loadAllData(false);
    }
    setBusyId(null);
  }

  async function checkInParty(partyId) {
    setBusyId(partyId);
    setError("");
    const { error: actionError } = await supabase.rpc("record_party_attendance_action", {
      p_party_id: partyId,
      p_action: "party_check_in",
      p_guest_ids: null,
      p_reason: null,
      p_device_id: deviceId,
      p_device_label: deviceLabel,
      p_metadata: { source: viewMode },
    });
    if (actionError) setError(actionError.message);
    else await loadAllData(false);
    setBusyId(null);
  }

  async function saveGuestDetails() {
    if (!editGuest) return;
    setBusyId(editGuest.id);
    const updates = {
      full_name: editGuest.full_name,
      organisation_name: editGuest.organisation_name,
      role_label: editGuest.role_label,
      relationship_label: editGuest.relationship_label,
      award_category: editGuest.award_category,
      phone: editGuest.phone,
      email: editGuest.email,
      dietary_notes: editGuest.dietary_notes,
      accessibility_notes: editGuest.accessibility_notes,
      admin_notes: editGuest.admin_notes,
      confirmation_status: editGuest.confirmation_status,
      seating_status: editGuest.seating_status,
      seat_sort_order: editGuest.seat_sort_order || null,
    };
    const { error: updateError } = await supabase.rpc("update_guest_details", {
      p_guest_id: editGuest.id,
      p_updates: updates,
      p_reason: "Updated in Operations Mode",
      p_device_id: deviceId,
      p_device_label: deviceLabel,
    });
    if (updateError) setError(updateError.message);
    else {
      setEditGuest(null);
      await loadAllData(false);
    }
    setBusyId(null);
  }

  async function assignTable(guest, tableNumber) {
    setBusyId(guest.id);
    const { error: assignError } = await supabase.rpc("assign_guest_table", {
      p_guest_id: guest.id,
      p_table_number: tableNumber || null,
      p_reason: "Changed in Operations Mode",
      p_seat_sort_order: guest.seat_sort_order || null,
      p_device_id: deviceId,
      p_device_label: deviceLabel,
    });
    if (assignError) setError(assignError.message);
    else await loadAllData(false);
    setBusyId(null);
  }

  async function saveQrLinks() {
    setError("");
    setMessage("");
    const { error: assetError } = await supabase.from("event_assets").upsert(
      {
        asset_key: "programme_pdf",
        label: "Digital programme PDF",
        asset_type: "programme_pdf",
        url: assetUrl,
        qr_enabled: true,
        active: true,
        display_order: 1,
      },
      { onConflict: "asset_key" },
    );
    if (assetError) {
      setError(assetError.message);
      return;
    }

    if (feedbackUrl) {
      const existing = data.feedbackLinks.find((link) => link.active);
      const feedbackPayload = {
        label: "Feedback form",
        url: feedbackUrl,
        active: true,
        display_order: 1,
      };
      if (existing?.id) feedbackPayload.id = existing.id;
      const { error: feedbackError } = await supabase.from("feedback_links").upsert(feedbackPayload);
      if (feedbackError) {
        setError(feedbackError.message);
        return;
      }
    }

    setMessage("QR links saved.");
    await loadAllData(false);
  }

  const filteredGuests = useMemo(() => {
    const q = normaliseText(query).toLowerCase();
    const base = [...data.guests].sort(sortByTable);
    if (!q) return base;
    return base.filter((guest) =>
      [
        guest.full_name,
        guest.organisation_name,
        guest.role_label,
        guest.relationship_label,
        guest.award_category,
        guest.phone,
        guest.email,
        guest.dietary_notes,
        guest.accessibility_notes,
        guest.event_tables?.table_number,
        guest.guest_parties?.party_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data.guests, query]);

  const selectedGuest = data.guests.find((guest) => guest.id === selectedGuestId) || filteredGuests[0];
  const selectedPartyGuests = selectedGuest?.party_id
    ? data.guests.filter((guest) => guest.party_id === selectedGuest.party_id).sort(sortByTable)
    : selectedGuest
      ? [selectedGuest]
      : [];

  const guestsByTable = useMemo(() => {
    const groups = new Map();
    for (const table of data.tables) groups.set(table.id, { table, guests: [] });
    for (const guest of data.guests) {
      const key = guest.table_id || "tbc";
      if (!groups.has(key)) groups.set(key, { table: { id: key, table_number: "TBC", table_label: "TBC" }, guests: [] });
      groups.get(key).guests.push(guest);
    }
    return [...groups.values()]
      .map((group) => ({ ...group, guests: group.guests.sort(sortByTable) }))
      .sort((a, b) => Number(a.table.table_number || 9999) - Number(b.table.table_number || 9999));
  }, [data.guests, data.tables]);

  if (!hasSupabaseConfig) {
    return (
      <main className="center-screen">
        <div className="auth-panel">
          <ShieldCheck size={34} />
          <h1>Supabase details needed</h1>
          <p>Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel or `.env.local`.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="center-screen">
        <form className="auth-panel" onSubmit={handleAuth}>
          <img src="/tcva-logo-mark.svg" alt="" className="brand-mark" />
          <h1>TCVA Awards 2026</h1>
          <p>Secure live check-in for event staff.</p>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button type="submit" className="primary-btn" disabled={loading}>
            {authMode === "sign-in" ? "Sign in" : "Create account"}
          </button>
          <button type="button" className="text-btn" onClick={() => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")}>
            {authMode === "sign-in" ? "Create the first app user" : "Back to sign in"}
          </button>
        </form>
      </main>
    );
  }

  if (!profile?.active) {
    return (
      <main className="center-screen">
        <div className="auth-panel">
          <ShieldCheck size={34} />
          <h1>Activate staff access</h1>
          <p>If this is the first active admin account, claim it here. Otherwise an existing admin will need to activate your profile.</p>
          <label>
            Full name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={session.user.email} />
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button type="button" className="primary-btn" onClick={claimFirstAdmin} disabled={loading}>
            Claim first admin
          </button>
          <button type="button" className="text-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`app-shell ${viewMode}`}>
      <header className="top-bar">
        <div>
          <p className="eyebrow">TCVA Awards 2026</p>
          <h1>Live Check-In</h1>
        </div>
        <div className="top-actions">
          <label className="device-label">
            Device
            <input
              value={deviceLabel}
              onChange={(event) => {
                setDeviceLabel(event.target.value);
                localStorage.setItem(DEVICE_LABEL_KEY, event.target.value);
              }}
            />
          </label>
          <div className="segmented">
            <button className={viewMode === "tablet" ? "active" : ""} onClick={() => setViewMode("tablet")}>
              <TabletSmartphone size={18} /> Sign-In
            </button>
            <button className={viewMode === "ops" ? "active" : ""} onClick={() => setViewMode("ops")}>
              <Monitor size={18} /> Operations
            </button>
          </div>
          <button className="icon-btn" onClick={() => loadAllData(true)} title="Refresh">
            <RefreshCw size={18} />
          </button>
          <button className="icon-btn" onClick={signOut} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      {loading && <div className="notice neutral">Loading live event data…</div>}

      {viewMode === "tablet" ? (
        <TabletMode
          guests={filteredGuests}
          selectedGuest={selectedGuest}
          selectedPartyGuests={selectedPartyGuests}
          query={query}
          setQuery={setQuery}
          setSelectedGuestId={setSelectedGuestId}
          recordAttendance={recordAttendance}
          checkInParty={checkInParty}
          busyId={busyId}
          undoReason={undoReason}
          setUndoReason={setUndoReason}
        />
      ) : (
        <OperationsMode
          activeTab={activeOpsTab}
          setActiveTab={setActiveOpsTab}
          data={data}
          guests={filteredGuests}
          guestsByTable={guestsByTable}
          query={query}
          setQuery={setQuery}
          setEditGuest={setEditGuest}
          assignTable={assignTable}
          assetUrl={assetUrl}
          setAssetUrl={setAssetUrl}
          feedbackUrl={feedbackUrl}
          setFeedbackUrl={setFeedbackUrl}
          saveQrLinks={saveQrLinks}
          busyId={busyId}
        />
      )}

      {editGuest && (
        <GuestEditModal
          guest={editGuest}
          tables={data.tables}
          setGuest={setEditGuest}
          onSave={saveGuestDetails}
          onAssignTable={assignTable}
          onClose={() => setEditGuest(null)}
          busy={busyId === editGuest.id}
        />
      )}
    </main>
  );
}

function TabletMode({
  guests,
  selectedGuest,
  selectedPartyGuests,
  query,
  setQuery,
  setSelectedGuestId,
  recordAttendance,
  checkInParty,
  busyId,
  undoReason,
  setUndoReason,
}) {
  return (
    <section className="tablet-layout">
      <aside className="search-pane">
        <div className="search-box">
          <Search size={22} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, table, organisation or notes" autoFocus />
        </div>
        <div className="guest-list">
          {guests.slice(0, 80).map((guest) => (
            <button key={guest.id} className={`guest-list-item ${selectedGuest?.id === guest.id ? "active" : ""}`} onClick={() => setSelectedGuestId(guest.id)}>
              <span>{guest.full_name}</span>
              <small>{tableLabel(guest)} · {statusLabel(guest.attendance_status)}</small>
            </button>
          ))}
          {!guests.length && <EmptyState title="No guests found" text="Try a different name, table number or organisation." />}
        </div>
      </aside>

      <section className="checkin-panel">
        {selectedGuest ? (
          <>
            <div className="guest-hero">
              <div>
                <p className="eyebrow">{tableLabel(selectedGuest)}</p>
                <h2>{selectedGuest.full_name}</h2>
                <p>{selectedGuest.organisation_name || selectedGuest.award_category || selectedGuest.role_label || "Guest"}</p>
              </div>
              <StatusPill status={selectedGuest.attendance_status} />
            </div>

            <div className="info-grid">
              <InfoCard label="Role" value={selectedGuest.role_label || selectedGuest.relationship_label} />
              <InfoCard label="Category" value={selectedGuest.award_category} />
              <InfoCard label="Dietary" value={selectedGuest.dietary_notes} warn />
              <InfoCard label="Accessibility" value={selectedGuest.accessibility_notes} warn />
              <InfoCard label="Notes" value={selectedGuest.linked_notes || selectedGuest.admin_notes} />
            </div>

            <div className="action-row">
              <button className="check-btn" disabled={busyId === selectedGuest.id || selectedGuest.attendance_status === "arrived"} onClick={() => recordAttendance(selectedGuest, "check_in")}>
                <Check size={26} /> Check in guest
              </button>
              <button className="secondary-btn" disabled={!selectedGuest.party_id || busyId === selectedGuest.party_id} onClick={() => checkInParty(selectedGuest.party_id)}>
                <Users size={24} /> Check in party
              </button>
            </div>

            <div className="undo-row">
              <input value={undoReason} onChange={(event) => setUndoReason(event.target.value)} placeholder="Reason for undo" />
              <button disabled={selectedGuest.attendance_status !== "arrived" || !undoReason} onClick={() => recordAttendance(selectedGuest, "undo_check_in", undoReason)}>
                <Undo2 size={18} /> Undo
              </button>
            </div>

            <h3>Linked party</h3>
            <div className="party-grid">
              {selectedPartyGuests.map((guest) => (
                <button key={guest.id} className="party-card" onClick={() => setSelectedGuestId(guest.id)}>
                  <span>{guest.full_name}</span>
                  <small>{tableLabel(guest)}</small>
                  <StatusPill status={guest.attendance_status} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="Search for a guest" text="Select a result to check in guests or linked parties." />
        )}
      </section>
    </section>
  );
}

function InfoCard({ label, value, warn = false }) {
  return (
    <div className={`info-card ${warn && value ? "warn" : ""}`}>
      <span>{label}</span>
      <strong>{value || "None recorded"}</strong>
    </div>
  );
}

function OperationsMode(props) {
  const tabs = [
    ["dashboard", "Dashboard"],
    ["guests", "Guests"],
    ["seating", "Seating"],
    ["exports", "Exports"],
    ["qr", "QR links"],
    ["audit", "Audit"],
  ];

  return (
    <section className="ops-layout">
      <nav className="ops-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={props.activeTab === id ? "active" : ""} onClick={() => props.setActiveTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {props.activeTab === "dashboard" && <Dashboard data={props.data} />}
      {props.activeTab === "guests" && <GuestManagement {...props} />}
      {props.activeTab === "seating" && <SeatingPlan {...props} />}
      {props.activeTab === "exports" && <Exports data={props.data} />}
      {props.activeTab === "qr" && <QrLinks {...props} />}
      {props.activeTab === "audit" && <AuditLog data={props.data} />}
    </section>
  );
}

function Dashboard({ data }) {
  const dashboard = data.dashboard || {};
  return (
    <div className="ops-panel">
      <div className="metric-grid">
        <Metric label="Expected" value={dashboard.total_expected || 0} />
        <Metric label="Arrived" value={dashboard.total_arrived || 0} />
        <Metric label="Outstanding" value={dashboard.outstanding || 0} />
        <Metric label="Attendance" value={`${dashboard.attendance_percent || 0}%`} />
      </div>
      <div className="two-column">
        <section>
          <h2>Category Attendance</h2>
          <DataTable
            rows={data.categories}
            columns={[
              ["Category", (row) => row.award_category],
              ["Expected", (row) => row.expected],
              ["Arrived", (row) => row.arrived],
              ["Outstanding", (row) => row.outstanding],
              ["%", (row) => row.attendance_percent ?? ""],
            ]}
          />
        </section>
        <section>
          <h2>Table Attendance</h2>
          <DataTable
            rows={[...data.tableSummary].sort((a, b) => Number(a.table_number || 999) - Number(b.table_number || 999))}
            columns={[
              ["Table", (row) => row.table_number],
              ["Assigned", (row) => row.assigned],
              ["Arrived", (row) => row.arrived],
              ["Dietary", (row) => row.dietary_flags],
              ["Access", (row) => row.accessibility_flags],
            ]}
          />
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GuestManagement({ guests, query, setQuery, setEditGuest }) {
  return (
    <div className="ops-panel">
      <div className="toolbar">
        <div className="search-box compact">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guests" />
        </div>
      </div>
      <DataTable
        rows={guests}
        columns={[
          ["Name", (row) => row.full_name],
          ["Table", (row) => tableLabel(row)],
          ["Status", (row) => statusLabel(row.attendance_status)],
          ["Confirmation", (row) => confirmationLabel(row.confirmation_status)],
          ["Organisation", (row) => row.organisation_name],
          ["Dietary", (row) => row.dietary_notes],
          ["Edit", (row) => (
            <button className="small-btn" onClick={() => setEditGuest({ ...row })}>
              <Pencil size={14} /> Edit
            </button>
          )],
        ]}
      />
    </div>
  );
}

function SeatingPlan({ guestsByTable, assignTable, setEditGuest, busyId }) {
  return (
    <div className="seating-grid">
      {guestsByTable.map((group) => (
        <section key={group.table.id} className="table-card">
          <h2>{group.table.table_number === "TBC" ? "TBC" : `Table ${group.table.table_number}`}</h2>
          <p>{group.guests.length} assigned{group.table.capacity ? ` of ${group.table.capacity}` : ""}</p>
          <div className="table-guests">
            {group.guests.map((guest) => (
              <div key={guest.id} className="table-guest">
                <div>
                  <strong>{guest.full_name}</strong>
                  <span>{guest.dietary_notes || guest.accessibility_notes || guest.organisation_name || ""}</span>
                </div>
                <button className="small-btn" disabled={busyId === guest.id} onClick={() => setEditGuest({ ...guest })}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Exports({ data }) {
  async function downloadSeatingExport() {
    const { data: rows, error } = await supabase.from("seating_plan_export").select("*").order("table_number");
    if (error) throw new Error(error.message);
    downloadCsv("tcva-awards-2026-seating-plan.csv", rows, Object.keys(rows[0] || {}).map((key) => ({ label: key, get: (row) => row[key] })));
  }

  const guestColumns = [
    { label: "Name", get: (row) => row.full_name },
    { label: "Table", get: (row) => row.event_tables?.table_number || "TBC" },
    { label: "Attendance", get: (row) => row.attendance_status },
    { label: "Confirmation", get: (row) => row.confirmation_status },
    { label: "Organisation", get: (row) => row.organisation_name },
    { label: "Category", get: (row) => row.award_category },
    { label: "Dietary", get: (row) => row.dietary_notes },
    { label: "Accessibility", get: (row) => row.accessibility_notes },
    { label: "Phone", get: (row) => row.phone },
    { label: "Email", get: (row) => row.email },
  ];

  return (
    <div className="ops-panel export-panel">
      <h2>CSV Exports</h2>
      <button className="primary-btn" onClick={() => downloadCsv("tcva-awards-2026-guests.csv", data.guests, guestColumns)}>
        <Download size={18} /> Guest list
      </button>
      <button className="primary-btn" onClick={downloadSeatingExport}>
        <Download size={18} /> Seating plan export
      </button>
      <button
        className="primary-btn"
        onClick={() =>
          downloadCsv(
            "tcva-awards-2026-attendance-events.csv",
            data.attendanceEvents,
            Object.keys(data.attendanceEvents[0] || {}).map((key) => ({ label: key, get: (row) => row[key] })),
          )
        }
      >
        <Download size={18} /> Attendance events
      </button>
    </div>
  );
}

function QrLinks({ assetUrl, setAssetUrl, feedbackUrl, setFeedbackUrl, saveQrLinks }) {
  return (
    <div className="ops-panel">
      <div className="qr-grid">
        <section className="qr-card">
          <QrCode size={24} />
          <h2>Digital Programme</h2>
          <QRCodeSVG value={assetUrl || PROGRAMME_URL} size={192} />
          <input value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} placeholder="Programme PDF URL" />
          <a href={assetUrl || PROGRAMME_URL} target="_blank" rel="noreferrer">
            Open programme <ExternalLink size={14} />
          </a>
        </section>
        <section className="qr-card">
          <QrCode size={24} />
          <h2>Feedback Form</h2>
          {feedbackUrl ? <QRCodeSVG value={feedbackUrl} size={192} /> : <div className="qr-placeholder">Add feedback form link</div>}
          <input value={feedbackUrl} onChange={(event) => setFeedbackUrl(event.target.value)} placeholder="Feedback form URL" />
          {feedbackUrl && (
            <a href={feedbackUrl} target="_blank" rel="noreferrer">
              Open feedback form <ExternalLink size={14} />
            </a>
          )}
        </section>
      </div>
      <button className="primary-btn" onClick={saveQrLinks}>Save QR links</button>
    </div>
  );
}

function AuditLog({ data }) {
  return (
    <div className="ops-panel">
      <h2>Latest Activity</h2>
      <DataTable
        rows={data.auditLog}
        columns={[
          ["When", (row) => formatDateTime(row.created_at)],
          ["Action", (row) => row.action],
          ["Table", (row) => row.table_name],
          ["User", (row) => row.performed_by_email],
          ["Reason", (row) => row.reason],
        ]}
      />
    </div>
  );
}

function GuestEditModal({ guest, tables, setGuest, onSave, onAssignTable, onClose, busy }) {
  const currentTable = guest.event_tables?.table_number || "";
  const [tableNumber, setTableNumber] = useState(currentTable);

  const fields = [
    ["full_name", "Name"],
    ["organisation_name", "Organisation"],
    ["role_label", "Role"],
    ["relationship_label", "Relationship"],
    ["award_category", "Category"],
    ["phone", "Phone"],
    ["email", "Email"],
    ["dietary_notes", "Dietary notes"],
    ["accessibility_notes", "Accessibility notes"],
    ["admin_notes", "Admin notes"],
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <h2>Edit Guest</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </header>
        <div className="modal-grid">
          {fields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input value={guest[key] || ""} onChange={(event) => setGuest({ ...guest, [key]: event.target.value })} />
            </label>
          ))}
          <label>
            Confirmation
            <select value={guest.confirmation_status} onChange={(event) => setGuest({ ...guest, confirmation_status: event.target.value })}>
              <option value="confirmed">Confirmed</option>
              <option value="unconfirmed">Unconfirmed</option>
              <option value="declined">Declined</option>
              <option value="waitlist">Waiting list</option>
              <option value="tbc">TBC</option>
            </select>
          </label>
          <label>
            Seating status
            <select value={guest.seating_status || "assigned"} onChange={(event) => setGuest({ ...guest, seating_status: event.target.value })}>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
              <option value="tbc">TBC</option>
              <option value="not_required">Not required</option>
            </select>
          </label>
          <label>
            Table
            <select value={tableNumber} onChange={(event) => setTableNumber(event.target.value)}>
              <option value="">TBC</option>
              {tables.map((table) => (
                <option key={table.id} value={table.table_number}>Table {table.table_number}</option>
              ))}
            </select>
          </label>
        </div>
        <footer>
          <button className="secondary-btn" onClick={() => onAssignTable(guest, tableNumber)} disabled={busy}>
            Move table
          </button>
          <button className="primary-btn" onClick={onSave} disabled={busy}>
            Save details
          </button>
        </footer>
      </div>
    </div>
  );
}

function DataTable({ rows, columns }) {
  if (!rows?.length) return <EmptyState title="No records" text="There is no data for this view yet." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([label]) => <th key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || `${rowIndex}-${columns[0][1](row)}`}>
              {columns.map(([label, getter]) => <td key={label}>{getter(row) || ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
