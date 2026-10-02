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
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  TabletSmartphone,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { downloadCsv } from "@/lib/csv";
import { confirmationLabel, finalistSafeLabel, formatDateTime, normaliseText, statusLabel, tableLabel } from "@/lib/format";
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

function sanitiseParty(party) {
  if (!party) return party;
  return {
    ...party,
    party_code: finalistSafeLabel(party.party_code),
    party_name: finalistSafeLabel(party.party_name),
    lead_guest_name: finalistSafeLabel(party.lead_guest_name),
    organisation_name: finalistSafeLabel(party.organisation_name),
  };
}

function sanitiseGuest(guest) {
  return {
    ...guest,
    source_sheet: finalistSafeLabel(guest.source_sheet),
    role_label: finalistSafeLabel(guest.role_label),
    relationship_label: finalistSafeLabel(guest.relationship_label),
    award_category: finalistSafeLabel(guest.award_category),
    sponsor_name: finalistSafeLabel(guest.sponsor_name),
    linked_notes: finalistSafeLabel(guest.linked_notes),
    admin_notes: finalistSafeLabel(guest.admin_notes),
    guest_parties: sanitiseParty(guest.guest_parties),
  };
}

function sanitiseCategory(row) {
  return {
    ...row,
    award_category: finalistSafeLabel(row.award_category),
  };
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

function isMissingRpc(error) {
  return error?.code === "PGRST202" || /could not find.*function|function .* does not exist|schema cache/i.test(error?.message || "");
}

function staffDisplayName(profile) {
  const fullName = profile?.full_name?.trim();
  if (fullName && !fullName.includes("@")) return fullName;
  return profile?.email || fullName || "Staff user";
}

export default function CheckInApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activationState, setActivationState] = useState({ can_claim_first_admin: true });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [viewMode, setViewMode] = useState("tablet");
  const [activeOpsTab, setActiveOpsTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [editGuest, setEditGuest] = useState(null);
  const [addGuest, setAddGuest] = useState(null);
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
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [staffBusyId, setStaffBusyId] = useState(null);
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

  useEffect(() => {
    if (profile?.role === "admin") loadStaffAccounts();
    else setStaffAccounts([]);
  }, [profile?.role]);

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
    } else {
      const { data: stateData, error: stateError } = await supabase.rpc("get_staff_activation_state");
      if (!stateError && stateData) setActivationState(stateData);
    }
    setLoading(false);
  }

  async function loadStaffAccounts() {
    const { data: accounts, error: accountsError } = await supabase.rpc("list_staff_accounts");
    if (accountsError) {
      setError(accountsError.message);
      return;
    }
    setStaffAccounts(accounts || []);
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

    const guests = (guestsResult.data || []).map(sanitiseGuest);
    const parties = (partiesResult.data || []).map(sanitiseParty);
    const categories = (categoriesResult.data || []).map(sanitiseCategory);
    const programme = assetsResult.data?.find((asset) => asset.asset_key === "programme_pdf");
    const feedback = feedbackResult.data?.find((link) => link.active);

    setAssetUrl(programme?.url || PROGRAMME_URL);
    setFeedbackUrl(feedback?.url || "");
    setData({
      guests,
      tables: tablesResult.data || [],
      parties,
      assets: assetsResult.data || [],
      feedbackLinks: feedbackResult.data || [],
      attendanceEvents: eventsResult.data || [],
      auditLog: auditResult.data || [],
      dashboard: dashboardResult.data || null,
      categories,
      tableSummary: tableSummaryResult.data || [],
    });

    if (showSpinner) setLoading(false);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    else setMessage("Signed in.");
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

  function updateStaffAccount(userId, field, value) {
    setStaffAccounts((current) => current.map((account) => (account.user_id === userId ? { ...account, [field]: value } : account)));
  }

  async function saveStaffAccount(account) {
    setStaffBusyId(account.user_id);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.rpc("set_staff_account_access", {
      p_user_id: account.user_id,
      p_full_name: account.full_name || null,
      p_role: account.role,
      p_active: account.active,
    });
    if (saveError) setError(saveError.message);
    else {
      setMessage(`Access updated for ${account.email}.`);
      await loadStaffAccounts();
    }
    setStaffBusyId(null);
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

  function openAddGuest() {
    setError("");
    setMessage("");
    setAddGuest({
      full_name: "",
      organisation_name: "",
      role_label: "",
      relationship_label: "",
      award_category: "",
      phone: "",
      email: "",
      dietary_notes: "",
      accessibility_notes: "",
      admin_notes: "",
      confirmation_status: "confirmed",
      seating_status: "tbc",
      seat_sort_order: "",
      party_id: "",
      table_number: "",
    });
  }

  async function createGuest() {
    const fullName = addGuest?.full_name?.trim();
    if (!fullName) {
      setError("Guest name is required.");
      return;
    }

    setBusyId("new-guest");
    setError("");
    setMessage("");
    const { data: createdGuest, error: createError } = await supabase.rpc("create_guest", {
      p_guest: {
        full_name: fullName,
        organisation_name: addGuest.organisation_name,
        role_label: addGuest.role_label,
        relationship_label: addGuest.relationship_label,
        award_category: addGuest.award_category,
        phone: addGuest.phone,
        email: addGuest.email,
        dietary_notes: addGuest.dietary_notes,
        accessibility_notes: addGuest.accessibility_notes,
        admin_notes: addGuest.admin_notes,
        confirmation_status: addGuest.confirmation_status,
        seating_status: addGuest.seating_status,
        seat_sort_order: addGuest.seat_sort_order || null,
      },
      p_table_number: addGuest.table_number || null,
      p_party_id: addGuest.party_id || null,
      p_reason: "Added in Operations Mode",
      p_device_id: deviceId,
      p_device_label: deviceLabel,
    });

    if (createError) {
      setError(createError.message);
    } else {
      setAddGuest(null);
      setSelectedGuestId(createdGuest?.id || null);
      setMessage(`${fullName} added.`);
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

  async function deleteGuest(guest) {
    if (!guest?.id) return;
    const confirmed = window.confirm(`Delete ${guest.full_name}? This will permanently remove this guest and any check-in history linked to them.`);
    if (!confirmed) return;

    setBusyId(guest.id);
    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("delete_guest", {
      p_guest_id: guest.id,
      p_reason: "Deleted in Operations Mode",
      p_device_id: deviceId,
      p_device_label: deviceLabel,
    });
    let deleteError = rpcError;

    if (isMissingRpc(rpcError)) {
      const { error: fallbackError } = await supabase.from("guests").delete().eq("id", guest.id);
      deleteError = fallbackError;
    }

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (selectedGuestId === guest.id) setSelectedGuestId(null);
      setEditGuest(null);
      setMessage(`${guest.full_name} deleted.`);
      await loadAllData(false);
    }
    setBusyId(null);
  }

  async function deleteTbcGuests(guests) {
    const count = guests?.length || 0;
    if (!count) return;
    const confirmation = window.prompt(
      `This will permanently delete all ${count} guests currently shown under TBC. Type DELETE to confirm.`,
    );
    if (confirmation !== "DELETE") return;

    setBusyId("tbc");
    setError("");
    setMessage("");
    const { data: deletedCount, error: rpcError } = await supabase.rpc("delete_tbc_guests", {
      p_reason: `Bulk deleted ${count} TBC guests in Operations Mode`,
      p_device_id: deviceId,
      p_device_label: deviceLabel,
    });
    let deleteError = rpcError;
    let deletedTotal = deletedCount || count;

    if (isMissingRpc(rpcError)) {
      const { data: deletedRows, error: fallbackError } = await supabase.from("guests").delete().is("table_id", null).select("id");
      deleteError = fallbackError;
      deletedTotal = deletedRows?.length || count;
    }

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setSelectedGuestId(null);
      setEditGuest(null);
      setMessage(`${deletedTotal} TBC guests deleted.`);
      await loadAllData(false);
    }
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
            Sign in
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
          <h1>Staff access pending</h1>
          <p>
            {activationState.can_claim_first_admin
              ? "No administrator has been activated yet. The first authorised account can claim administrator access below."
              : "Your sign-in is valid, but this staff profile is awaiting activation by an administrator."}
          </p>
          <label>
            Full name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={session.user.email} />
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          {activationState.can_claim_first_admin && (
            <button type="button" className="primary-btn" onClick={claimFirstAdmin} disabled={loading}>
              Claim first admin
            </button>
          )}
          <button type="button" className="secondary-btn" onClick={loadProfileAndData} disabled={loading}>
            <RefreshCw size={17} /> Check access again
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
        <div className="brand-lockup">
          <img src="/tcva-logo-mark.svg" alt="" className="top-brand-mark" />
          <div>
            <p className="eyebrow">TCVA Awards 2026</p>
            <h1>Live Check-In</h1>
          </div>
        </div>
        <div className="top-actions">
          <div className="active-user" title={profile.email || "Signed-in staff account"}>
            <ShieldCheck size={19} />
            <div>
              <span>Signed in as</span>
              <strong>{staffDisplayName(profile)}</strong>
            </div>
          </div>
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
          openAddGuest={openAddGuest}
          recordAttendance={recordAttendance}
          assignTable={assignTable}
          deleteGuest={deleteGuest}
          deleteTbcGuests={deleteTbcGuests}
          assetUrl={assetUrl}
          setAssetUrl={setAssetUrl}
          feedbackUrl={feedbackUrl}
          setFeedbackUrl={setFeedbackUrl}
          saveQrLinks={saveQrLinks}
          busyId={busyId}
          profile={profile}
          staffAccounts={staffAccounts}
          updateStaffAccount={updateStaffAccount}
          saveStaffAccount={saveStaffAccount}
          staffBusyId={staffBusyId}
        />
      )}

      {editGuest && (
        <GuestEditModal
          guest={editGuest}
          tables={data.tables}
          setGuest={setEditGuest}
          onSave={saveGuestDetails}
          onAssignTable={assignTable}
          onDelete={deleteGuest}
          onClose={() => setEditGuest(null)}
          busy={busyId === editGuest.id}
        />
      )}

      {addGuest && (
        <GuestAddModal
          guest={addGuest}
          tables={data.tables}
          parties={data.parties}
          setGuest={setAddGuest}
          onSave={createGuest}
          onClose={() => setAddGuest(null)}
          busy={busyId === "new-guest"}
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
                <p>{selectedGuest.organisation_name || finalistSafeLabel(selectedGuest.award_category) || finalistSafeLabel(selectedGuest.role_label) || "Guest"}</p>
              </div>
              <StatusPill status={selectedGuest.attendance_status} />
            </div>

            <div className="info-grid">
              <InfoCard label="Role" value={finalistSafeLabel(selectedGuest.role_label || selectedGuest.relationship_label)} />
              <InfoCard label="Category" value={finalistSafeLabel(selectedGuest.award_category)} />
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
  if (props.profile?.role === "admin") tabs.push(["staff", "Staff access"]);

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
      {props.activeTab === "staff" && <StaffAccess {...props} />}
    </section>
  );
}

function StaffAccess({ staffAccounts, updateStaffAccount, saveStaffAccount, staffBusyId, profile }) {
  return (
    <div className="ops-panel">
      <div className="section-heading">
        <div>
          <h2>Staff access</h2>
          <p>Accounts are created in Supabase Authentication, then their access and role can be controlled here.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Full name</th>
              <th>Role</th>
              <th>Active</th>
              <th>Last sign-in</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {staffAccounts.map((account) => {
              const isCurrentAdmin = account.user_id === profile?.user_id;
              return (
                <tr key={account.user_id}>
                  <td>{account.email}</td>
                  <td>
                    <input
                      value={account.full_name || ""}
                      onChange={(event) => updateStaffAccount(account.user_id, "full_name", event.target.value)}
                      aria-label={`Full name for ${account.email}`}
                    />
                  </td>
                  <td>
                    <select
                      value={account.role}
                      disabled={isCurrentAdmin}
                      onChange={(event) => updateStaffAccount(account.user_id, "role", event.target.value)}
                      aria-label={`Role for ${account.email}`}
                    >
                      <option value="check_in">Check-in staff</option>
                      <option value="event_manager">Event manager</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </td>
                  <td>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={account.active}
                        disabled={isCurrentAdmin}
                        onChange={(event) => updateStaffAccount(account.user_id, "active", event.target.checked)}
                      />
                      {account.active ? "Active" : "Inactive"}
                    </label>
                  </td>
                  <td>{account.last_sign_in_at ? formatDateTime(account.last_sign_in_at) : "Not yet"}</td>
                  <td>
                    <button className="small-btn" disabled={staffBusyId === account.user_id} onClick={() => saveStaffAccount(account)}>
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!staffAccounts.length && <EmptyState title="No staff accounts found" text="Create the user in Supabase Authentication, then refresh this page." />}
    </div>
  );
}

function Dashboard({ data }) {
  const dashboard = data.dashboard || {};
  const expected = Number(dashboard.total_expected || 0);
  const arrived = Number(dashboard.total_arrived || 0);
  const outstanding = Number(dashboard.outstanding || 0);
  const attendancePercent = Math.max(0, Math.min(100, Number(dashboard.attendance_percent || 0)));
  const tableRows = [...data.tableSummary]
    .map((row) => {
      const assigned = Number(row.assigned || 0);
      const tableArrived = Number(row.arrived || 0);
      return {
        ...row,
        assigned,
        arrived: tableArrived,
        attendancePercent: assigned ? Math.round((tableArrived / assigned) * 100) : 0,
      };
    })
    .filter((row) => row.assigned > 0)
    .sort((a, b) => Number(a.table_number || 999) - Number(b.table_number || 999));
  const tablesStarted = tableRows.filter((row) => row.arrived > 0).length;
  const completeTables = tableRows.filter((row) => row.assigned > 0 && row.arrived >= row.assigned).length;
  const dietaryFlags = tableRows.reduce((total, row) => total + Number(row.dietary_flags || 0), 0);
  const accessibilityFlags = tableRows.reduce((total, row) => total + Number(row.accessibility_flags || 0), 0);

  return (
    <div className="ops-panel">
      <div className="metric-grid">
        <Metric label="Expected" value={expected} />
        <Metric label="Arrived" value={arrived} />
        <Metric label="Outstanding" value={outstanding} />
        <Metric label="Attendance" value={`${attendancePercent}%`} />
      </div>
      <div className="dashboard-visuals">
        <section className="visual-card arrival-overview">
          <div className="visual-card-heading">
            <div>
              <p className="eyebrow">Live overview</p>
              <h2>Overall arrival progress</h2>
            </div>
            <span className="live-indicator">Live</span>
          </div>
          <div className="arrival-chart-row">
            <div
              className="progress-ring"
              style={{ "--progress": `${attendancePercent}%` }}
              role="img"
              aria-label={`${attendancePercent}% attendance: ${arrived} of ${expected} guests arrived`}
            >
              <div className="progress-ring-centre">
                <strong>{attendancePercent}%</strong>
                <span>arrived</span>
              </div>
            </div>
            <div className="arrival-breakdown">
              <div>
                <span className="chart-key arrived-key" />
                <p><strong>{arrived}</strong> arrived</p>
              </div>
              <div>
                <span className="chart-key outstanding-key" />
                <p><strong>{outstanding}</strong> outstanding</p>
              </div>
              <div className="attendance-track" aria-hidden="true">
                <span style={{ width: `${attendancePercent}%` }} />
              </div>
            </div>
          </div>
          <div className="desk-stat-grid">
            <VisualStat label="Tables started" value={`${tablesStarted}/${tableRows.length}`} />
            <VisualStat label="Dietary notes" value={dietaryFlags} />
            <VisualStat label="Accessibility notes" value={accessibilityFlags} />
          </div>
        </section>

        <section className="visual-card table-progress-panel">
          <div className="visual-card-heading">
            <div>
              <p className="eyebrow">Sign-in desk</p>
              <h2>Arrivals by table</h2>
            </div>
            <span className="completion-summary">{completeTables} complete</span>
          </div>
          <div className="table-progress-grid">
            {tableRows.map((row) => (
              <div className={`table-progress-item ${row.attendancePercent === 100 ? "complete" : ""}`} key={row.id || row.table_number}>
                <div className="table-progress-label">
                  <strong>{row.table_number === "TBC" ? "TBC" : `Table ${row.table_number}`}</strong>
                  <span>{row.arrived} of {row.assigned}</span>
                </div>
                <div
                  className="table-progress-track"
                  role="progressbar"
                  aria-label={`Table ${row.table_number}: ${row.arrived} of ${row.assigned} guests arrived`}
                  aria-valuemin="0"
                  aria-valuemax={row.assigned}
                  aria-valuenow={row.arrived}
                >
                  <span style={{ width: `${row.attendancePercent}%` }} />
                </div>
              </div>
            ))}
          </div>
          {!tableRows.length && <EmptyState title="No table data yet" text="Table progress will appear as guests are assigned." />}
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

function VisualStat({ label, value }) {
  return (
    <div className="visual-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function GuestManagement({ guests, query, setQuery, setEditGuest, openAddGuest, recordAttendance, deleteGuest, busyId, profile }) {
  const canManageGuests = profile?.role === "admin" || profile?.role === "event_manager";

  return (
    <div className="ops-panel">
      <div className="toolbar">
        <div className="search-box compact">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guests" />
        </div>
        {canManageGuests && (
          <button className="primary-btn" onClick={openAddGuest}>
            <Plus size={18} /> Add guest
          </button>
        )}
      </div>
      <DataTable
        rows={guests}
        columns={[
          ["Name", (row) => row.full_name],
          ["Table", (row) => tableLabel(row)],
          ["Status", (row) => statusLabel(row.attendance_status)],
          ["Check-in", (row) => {
            const hasArrived = row.attendance_status === "arrived";
            return (
              <button
                className={`small-btn ${hasArrived ? "arrived-btn" : "quick-checkin-btn"}`}
                disabled={hasArrived || busyId === row.id}
                onClick={() => recordAttendance(row, "check_in")}
              >
                <Check size={14} /> {hasArrived ? "Arrived" : "Check in"}
              </button>
            );
          }],
          ["Confirmation", (row) => confirmationLabel(row.confirmation_status)],
          ["Organisation", (row) => finalistSafeLabel(row.organisation_name)],
          ["Dietary", (row) => row.dietary_notes],
          ["Edit", (row) => (
            <button className="small-btn" onClick={() => setEditGuest({ ...row })}>
              <Pencil size={14} /> Edit
            </button>
          )],
          ["Delete", (row) => (
            <button className="small-btn danger-btn" disabled={busyId === row.id} onClick={() => deleteGuest(row)}>
              <Trash2 size={14} /> Delete
            </button>
          )],
        ]}
      />
    </div>
  );
}

function SeatingPlan({ guestsByTable, setEditGuest, openAddGuest, deleteGuest, deleteTbcGuests, busyId, profile }) {
  const canManageGuests = profile?.role === "admin" || profile?.role === "event_manager";

  return (
    <div className="seating-view">
      <div className="section-heading seating-heading">
        <div>
          <h2>Seating plan</h2>
          <p>Add guests, review assignments and move guests between tables.</p>
        </div>
        {canManageGuests && (
          <button className="primary-btn" onClick={openAddGuest}>
            <Plus size={18} /> Add guest
          </button>
        )}
      </div>
      <div className="seating-grid">
        {guestsByTable.map((group) => (
          <section key={group.table.id} className="table-card">
            <div className="table-card-header">
              <div>
                <h2>{group.table.table_number === "TBC" ? "TBC" : `Table ${group.table.table_number}`}</h2>
                <p>{group.guests.length} assigned{group.table.capacity ? ` of ${group.table.capacity}` : ""}</p>
              </div>
              {group.table.table_number === "TBC" && group.guests.length > 0 && (
                <button className="small-btn danger-btn" disabled={busyId === "tbc"} onClick={() => deleteTbcGuests(group.guests)}>
                  <Trash2 size={14} /> Clear TBC
                </button>
              )}
            </div>
            <div className="table-guests">
              {group.guests.map((guest) => (
                <div key={guest.id} className="table-guest">
                  <div>
                    <strong>{guest.full_name}</strong>
                    <span>{guest.dietary_notes || guest.accessibility_notes || guest.organisation_name || ""}</span>
                  </div>
                  <div className="table-guest-actions">
                    <button className="small-btn" disabled={busyId === guest.id} onClick={() => setEditGuest({ ...guest })}>
                      Edit
                    </button>
                    <button className="small-btn danger-btn" disabled={busyId === guest.id} onClick={() => deleteGuest(guest)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function GuestAddModal({ guest, tables, parties, setGuest, onSave, onClose, busy }) {
  const fields = [
    ["full_name", "Name", true],
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

  function updateTable(tableNumber) {
    setGuest({
      ...guest,
      table_number: tableNumber,
      seating_status: tableNumber ? "assigned" : "tbc",
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <div>
            <p className="eyebrow">Operations mode</p>
            <h2>Add Guest</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close add guest form">×</button>
        </header>
        <div className="modal-grid">
          {fields.map(([key, label, required]) => (
            <label key={key}>
              {label}{required ? " *" : ""}
              <input
                value={guest[key] || ""}
                onChange={(event) => setGuest({ ...guest, [key]: event.target.value })}
                required={Boolean(required)}
                autoFocus={key === "full_name"}
              />
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
            Table
            <select value={guest.table_number} onChange={(event) => updateTable(event.target.value)}>
              <option value="">TBC</option>
              {tables.map((table) => (
                <option key={table.id} value={table.table_number}>Table {table.table_number}</option>
              ))}
            </select>
          </label>
          <label>
            Linked party (optional)
            <select value={guest.party_id} onChange={(event) => setGuest({ ...guest, party_id: event.target.value })}>
              <option value="">No linked party</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>{party.party_name || party.lead_guest_name || party.organisation_name || party.party_code || "Unnamed party"}</option>
              ))}
            </select>
          </label>
          {!guest.table_number && (
            <label>
              Seating status
              <select value={guest.seating_status} onChange={(event) => setGuest({ ...guest, seating_status: event.target.value })}>
                <option value="tbc">TBC</option>
                <option value="unassigned">Unassigned</option>
                <option value="not_required">Not required</option>
              </select>
            </label>
          )}
        </div>
        <div className="modal-note">
          The new guest will be added as Not arrived and will appear immediately on all signed-in devices.
        </div>
        <footer>
          <button className="secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary-btn" onClick={onSave} disabled={busy || !guest.full_name.trim()}>
            <Plus size={17} /> Add guest
          </button>
        </footer>
      </div>
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
    { label: "Category", get: (row) => finalistSafeLabel(row.award_category) },
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

function GuestEditModal({ guest, tables, setGuest, onSave, onAssignTable, onDelete, onClose, busy }) {
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
          <button className="secondary-btn danger-btn" onClick={() => onDelete(guest)} disabled={busy}>
            <Trash2 size={16} /> Delete guest
          </button>
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
