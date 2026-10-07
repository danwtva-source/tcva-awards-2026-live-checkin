import { confirmationLabel, finalistSafeLabel, formatDateTime, normaliseText, statusLabel } from "@/lib/format";

const EXPECTED_CONFIRMATIONS = new Set(["confirmed", "unconfirmed", "tbc"]);
const AWARD_RESULT_LABELS = {
  finalist: "Finalist",
  winner: "Winner",
  runner_up: "Runner up",
  special_award: "Special award",
  not_applicable: "Not applicable",
};

export const REPORT_EXPORTS = [
  {
    key: "event-summary",
    title: "Event summary report",
    why: "Total guests, arrived, not arrived and attendance rate. Useful for a quick post-event summary and headline reporting.",
  },
  {
    key: "table-performance",
    title: "Table performance report",
    why: "Assigned, arrived, not arrived and completion rate by table. Useful for spotting table-level no-shows and seating gaps.",
  },
  {
    key: "arrival-timeline",
    title: "Arrival timeline",
    why: "Check-ins by hour or 15-minute window. Useful for planning staffing, reception flow and tablet placement next year.",
  },
  {
    key: "device-staff-audit",
    title: "Device and staff audit",
    why: "Check-ins by device type and staff account, plus undo counts. Useful for operational review and troubleshooting.",
  },
  {
    key: "no-show",
    title: "No-show report",
    why: "No-shows by table, category, organisation and guest type. Useful for follow-up, future invite planning and data cleansing.",
  },
  {
    key: "operational-requirements",
    title: "Dietary and accessibility operations report",
    why: "Counts and details by table, especially who has arrived or is still outstanding. Useful for front-of-house and venue coordination.",
  },
  {
    key: "data-quality",
    title: "Data quality report",
    why: "Missing email, phone, category, organisation, seating and duplicate records. Useful before each event to clean the guest list.",
  },
  {
    key: "seating-completeness",
    title: "Seating completeness report",
    why: "Assigned seats, TBC or unassigned seats, missing seat order and table fill levels. Useful for table-plan checks before the event.",
  },
  {
    key: "party-groups",
    title: "Party and group report",
    why: "Linked guest group size and partial-arrival status. Useful where nominators, finalists, guests and plus-ones should be reviewed together.",
  },
];

function hasText(value) {
  return normaliseText(value).length > 0;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function percentage(numerator, denominator) {
  if (!denominator) return "";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function isExpectedGuest(guest) {
  return EXPECTED_CONFIRMATIONS.has(guest?.confirmation_status);
}

function isArrived(guest) {
  return guest?.attendance_status === "arrived";
}

function awardResultLabel(value) {
  return AWARD_RESULT_LABELS[value] || normaliseText(value);
}

function guestTypeLabel(value, guestTypes = []) {
  const match = guestTypes.find((type) => type.value === value);
  return match?.label || normaliseText(value || "Guest");
}

function guestTableNumber(guest) {
  return guest?.event_tables?.table_number || guest?.table_number || "";
}

function guestTableLabel(guest) {
  const number = guestTableNumber(guest);
  return number ? `Table ${number}` : "TBC";
}

function tableSortValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 9999;
}

function sortGuestsForReports(a, b) {
  const tableDiff = tableSortValue(guestTableNumber(a)) - tableSortValue(guestTableNumber(b));
  if (tableDiff) return tableDiff;
  return numberValue(a?.seat_sort_order || 9999) - numberValue(b?.seat_sort_order || 9999) || normaliseText(a?.full_name).localeCompare(normaliseText(b?.full_name));
}

function sortTableRows(a, b) {
  return tableSortValue(a.table_number) - tableSortValue(b.table_number) || normaliseText(a.table_label).localeCompare(normaliseText(b.table_label));
}

function simpleColumns(labels) {
  return labels.map(([key, label]) => ({ label, get: (row) => row[key] }));
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function getLocalBucketStart(value, minutes = 15) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setSeconds(0, 0);
  date.setMinutes(Math.floor(date.getMinutes() / minutes) * minutes);
  return date;
}

function tableGroups(data) {
  const tables = new Map();
  (data.tables || []).forEach((table) => {
    tables.set(table.id, {
      id: table.id,
      table_number: table.table_number || "",
      table_label: table.table_label || (table.table_number ? `Table ${table.table_number}` : "TBC"),
      capacity: numberValue(table.capacity),
      is_vip: Boolean(table.is_vip),
      guests: [],
    });
  });

  (data.guests || []).forEach((guest) => {
    const key = guest.table_id || guest.event_tables?.id || "tbc";
    if (!tables.has(key)) {
      tables.set(key, {
        id: key,
        table_number: guestTableNumber(guest) || "TBC",
        table_label: guestTableLabel(guest),
        capacity: numberValue(guest.event_tables?.capacity),
        is_vip: Boolean(guest.event_tables?.is_vip),
        guests: [],
      });
    }
    tables.get(key).guests.push(guest);
  });

  return [...tables.values()].sort(sortTableRows);
}

function buildEventSummary(data) {
  const guests = data.guests || [];
  const expectedGuests = guests.filter(isExpectedGuest);
  const arrived = guests.filter(isArrived).length;
  const outstanding = expectedGuests.filter((guest) => guest.attendance_status === "not_arrived").length;
  const dietary = guests.filter((guest) => hasText(guest.dietary_notes)).length;
  const accessibility = guests.filter((guest) => hasText(guest.accessibility_notes)).length;
  const emailable = guests.filter((guest) => hasText(guest.email)).length;
  const checkInEvents = (data.attendanceEvents || []).filter((event) => event.new_status === "arrived").length;
  const undoEvents = (data.attendanceEvents || []).filter((event) => event.action === "undo_check_in").length;

  const rows = [
    ["Event", data.activeEvent?.event_name || "", "Active event name."],
    ["Event date", formatDate(data.activeEvent?.event_date), "Date recorded against the active event."],
    ["Venue", data.activeEvent?.venue_name || "", "Venue recorded against the active event."],
    ["Total guest records", guests.length, "All guest records currently held for this event."],
    ["Expected guests", expectedGuests.length, "Guests with confirmed, unconfirmed or TBC confirmation status."],
    ["Arrived", arrived, "Guests currently marked as arrived."],
    ["Not arrived", outstanding, "Expected guests currently still marked as not arrived."],
    ["Attendance rate", percentage(arrived, expectedGuests.length), "Arrived guests divided by expected guests."],
    ["Not attending", guests.filter((guest) => guest.attendance_status === "not_attending").length, "Guests marked as not attending."],
    ["Confirmed", guests.filter((guest) => guest.confirmation_status === "confirmed").length, "Guests with confirmed status."],
    ["Unconfirmed", guests.filter((guest) => guest.confirmation_status === "unconfirmed").length, "Guests with unconfirmed status."],
    ["TBC", guests.filter((guest) => guest.confirmation_status === "tbc").length, "Guests with TBC confirmation status."],
    ["Declined", guests.filter((guest) => guest.confirmation_status === "declined").length, "Guests marked as declined."],
    ["Waiting list", guests.filter((guest) => guest.confirmation_status === "waitlist").length, "Guests on the waiting list."],
    ["Tables", tableGroups(data).filter((table) => table.id !== "tbc").length, "Number of event tables currently held."],
    ["Dietary notes", dietary, "Guest records with dietary notes."],
    ["Accessibility notes", accessibility, "Guest records with accessibility notes."],
    ["Email addresses", emailable, "Guest records with an email address."],
    ["Missing email addresses", guests.length - emailable, "Guest records without an email address."],
    ["Check-in actions logged", checkInEvents, "Attendance event rows that recorded an arrived status."],
    ["Undo actions logged", undoEvents, "Attendance event rows that reversed a check-in."],
  ].map(([metric, value, notes]) => ({ metric, value, notes }));

  return {
    rows,
    columns: simpleColumns([
      ["metric", "Metric"],
      ["value", "Value"],
      ["notes", "Notes"],
    ]),
  };
}

function buildTablePerformance(data) {
  const rows = tableGroups(data).map((table) => {
    const guests = table.guests || [];
    const expected = guests.filter(isExpectedGuest);
    const arrived = guests.filter(isArrived);
    const notArrived = expected.filter((guest) => guest.attendance_status === "not_arrived");
    const capacity = numberValue(table.capacity);
    return {
      table: table.table_number || "TBC",
      table_label: table.table_label || "TBC",
      capacity: capacity || "",
      expected_guests: expected.length,
      arrived: arrived.length,
      not_arrived: notArrived.length,
      not_attending: guests.filter((guest) => guest.attendance_status === "not_attending").length,
      attendance_rate: percentage(arrived.length, expected.length),
      table_fill_rate: percentage(expected.length, capacity),
      remaining_capacity: capacity ? capacity - expected.length : "",
      dietary_flags: guests.filter((guest) => hasText(guest.dietary_notes)).length,
      accessibility_flags: guests.filter((guest) => hasText(guest.accessibility_notes)).length,
      vip_table: table.is_vip ? "Yes" : "",
    };
  });

  return {
    rows,
    columns: simpleColumns([
      ["table", "Table"],
      ["table_label", "Table label"],
      ["capacity", "Capacity"],
      ["expected_guests", "Expected guests"],
      ["arrived", "Arrived"],
      ["not_arrived", "Not arrived"],
      ["not_attending", "Not attending"],
      ["attendance_rate", "Attendance rate"],
      ["table_fill_rate", "Table fill rate"],
      ["remaining_capacity", "Remaining capacity"],
      ["dietary_flags", "Dietary flags"],
      ["accessibility_flags", "Accessibility flags"],
      ["vip_table", "VIP table"],
    ]),
  };
}

function buildArrivalTimeline(data) {
  const grouped = new Map();
  (data.attendanceEvents || [])
    .filter((event) => event.new_status === "arrived")
    .forEach((event) => {
      const bucket = getLocalBucketStart(event.created_at);
      if (!bucket) return;
      const key = bucket.getTime();
      if (!grouped.has(key)) grouped.set(key, { bucket, events: [] });
      grouped.get(key).events.push(event);
    });

  let cumulative = 0;
  const rows = [...grouped.values()]
    .sort((a, b) => a.bucket - b.bucket)
    .map((group) => {
      const end = new Date(group.bucket.getTime() + 15 * 60 * 1000);
      cumulative += group.events.length;
      return {
        date: formatDate(group.bucket),
        time_window: `${formatTime(group.bucket)} to ${formatTime(end)}`,
        check_in_actions: group.events.length,
        unique_guests: new Set(group.events.map((event) => event.guest_id).filter(Boolean)).size,
        cumulative_check_ins: cumulative,
        devices_used: [...new Set(group.events.map((event) => event.device_label).filter(Boolean))].join(", "),
        staff_accounts: [...new Set(group.events.map((event) => event.performed_by_email).filter(Boolean))].join(", "),
        first_action: formatDateTime(group.events.reduce((earliest, event) => (new Date(event.created_at) < new Date(earliest.created_at) ? event : earliest), group.events[0])?.created_at),
        last_action: formatDateTime(group.events.reduce((latest, event) => (new Date(event.created_at) > new Date(latest.created_at) ? event : latest), group.events[0])?.created_at),
      };
    });

  return {
    rows,
    columns: simpleColumns([
      ["date", "Date"],
      ["time_window", "Time window"],
      ["check_in_actions", "Check-in actions"],
      ["unique_guests", "Unique guests"],
      ["cumulative_check_ins", "Cumulative check-ins"],
      ["devices_used", "Devices used"],
      ["staff_accounts", "Staff accounts"],
      ["first_action", "First action"],
      ["last_action", "Last action"],
    ]),
  };
}

function buildDeviceStaffAudit(data) {
  const grouped = new Map();
  (data.attendanceEvents || []).forEach((event) => {
    const key = `${event.performed_by_email || "Unknown"}|${event.device_label || "Unknown"}`;
    if (!grouped.has(key)) grouped.set(key, { user: event.performed_by_email || "Unknown", device: event.device_label || "Unknown", events: [] });
    grouped.get(key).events.push(event);
  });

  const rows = [...grouped.values()]
    .sort((a, b) => a.user.localeCompare(b.user) || a.device.localeCompare(b.device))
    .map((group) => {
      const sorted = [...group.events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return {
        user: group.user,
        device: group.device,
        total_actions: group.events.length,
        check_ins: group.events.filter((event) => event.action === "check_in").length,
        party_check_ins: group.events.filter((event) => event.action === "party_check_in").length,
        undo_check_ins: group.events.filter((event) => event.action === "undo_check_in").length,
        arrivals_recorded: group.events.filter((event) => event.new_status === "arrived").length,
        unique_guests: new Set(group.events.map((event) => event.guest_id).filter(Boolean)).size,
        first_action: formatDateTime(sorted[0]?.created_at),
        last_action: formatDateTime(sorted.at(-1)?.created_at),
      };
    });

  return {
    rows,
    columns: simpleColumns([
      ["user", "User"],
      ["device", "Device"],
      ["total_actions", "Total actions"],
      ["check_ins", "Check-ins"],
      ["party_check_ins", "Party check-ins"],
      ["undo_check_ins", "Undo check-ins"],
      ["arrivals_recorded", "Arrivals recorded"],
      ["unique_guests", "Unique guests"],
      ["first_action", "First action"],
      ["last_action", "Last action"],
    ]),
  };
}

function buildNoShow(data) {
  const rows = (data.guests || [])
    .filter((guest) => isExpectedGuest(guest) && guest.attendance_status !== "arrived")
    .sort(sortGuestsForReports)
    .map((guest) => ({
      name: guest.full_name,
      table: guestTableLabel(guest),
      guest_type: guestTypeLabel(guest.guest_type, data.guestTypes),
      category: finalistSafeLabel(guest.award_category),
      organisation: finalistSafeLabel(guest.organisation_name),
      confirmation_status: confirmationLabel(guest.confirmation_status),
      attendance_status: statusLabel(guest.attendance_status),
      phone: guest.phone,
      email: guest.email,
      party: finalistSafeLabel(guest.guest_parties?.party_name || guest.guest_parties?.party_code),
    }));

  return {
    rows,
    columns: simpleColumns([
      ["name", "Name"],
      ["table", "Table"],
      ["guest_type", "Guest type"],
      ["category", "Category"],
      ["organisation", "Organisation"],
      ["confirmation_status", "Confirmation status"],
      ["attendance_status", "Attendance status"],
      ["phone", "Phone"],
      ["email", "Email"],
      ["party", "Party"],
    ]),
  };
}

function buildOperationalRequirements(data) {
  const rows = (data.guests || [])
    .filter((guest) => hasText(guest.dietary_notes) || hasText(guest.accessibility_notes))
    .sort(sortGuestsForReports)
    .map((guest) => ({
      table: guestTableLabel(guest),
      seat_order: guest.seat_sort_order || "",
      name: guest.full_name,
      guest_type: guestTypeLabel(guest.guest_type, data.guestTypes),
      attendance_status: statusLabel(guest.attendance_status),
      dietary_notes: guest.dietary_notes,
      accessibility_notes: guest.accessibility_notes,
      admin_notes: guest.admin_notes,
      party: finalistSafeLabel(guest.guest_parties?.party_name || guest.guest_parties?.party_code),
    }));

  return {
    rows,
    columns: simpleColumns([
      ["table", "Table"],
      ["seat_order", "Seat order"],
      ["name", "Name"],
      ["guest_type", "Guest type"],
      ["attendance_status", "Attendance status"],
      ["dietary_notes", "Dietary notes"],
      ["accessibility_notes", "Accessibility notes"],
      ["admin_notes", "Admin notes"],
      ["party", "Party"],
    ]),
  };
}

function duplicateRecordCount(values) {
  const counts = values.reduce((map, value) => {
    const key = normaliseText(value).toLowerCase();
    if (!key) return map;
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
}

function categoryVariantCount(guests) {
  const variants = guests.reduce((map, guest) => {
    const raw = normaliseText(guest.award_category);
    if (!raw) return map;
    const key = raw.toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(raw);
    return map;
  }, new Map());

  return [...variants.values()].filter((set) => set.size > 1).reduce((sum, set) => sum + set.size, 0);
}

function buildDataQuality(data) {
  const guests = data.guests || [];
  const issueRows = [
    {
      issue: "Missing email address",
      affected_records: guests.filter((guest) => !hasText(guest.email)).length,
      why_it_matters: "Limits feedback emails and future event communications.",
      suggested_action: "Add email address or record that email contact is unavailable.",
      priority: "High",
    },
    {
      issue: "Missing phone number",
      affected_records: guests.filter((guest) => !hasText(guest.phone)).length,
      why_it_matters: "Limits urgent contact and manual follow-up.",
      suggested_action: "Add phone number where contact permission allows.",
      priority: "Medium",
    },
    {
      issue: "Missing category",
      affected_records: guests.filter((guest) => !hasText(guest.award_category)).length,
      why_it_matters: "Reduces category attendance and finalist reporting quality.",
      suggested_action: "Select the relevant award category or mark as not applicable.",
      priority: "Medium",
    },
    {
      issue: "Missing organisation",
      affected_records: guests.filter((guest) => !hasText(guest.organisation_name)).length,
      why_it_matters: "Limits sponsor, partner and organisation-level reporting.",
      suggested_action: "Add organisation name where relevant.",
      priority: "Low",
    },
    {
      issue: "Missing table assignment",
      affected_records: guests.filter((guest) => !guest.table_id && !guest.event_tables?.id).length,
      why_it_matters: "Guests may be difficult to seat or support on arrival.",
      suggested_action: "Assign a table or set seating status to TBC/not required.",
      priority: "High",
    },
    {
      issue: "Missing seat order",
      affected_records: guests.filter((guest) => (guest.table_id || guest.event_tables?.id) && !guest.seat_sort_order).length,
      why_it_matters: "Table plans are harder to read and export consistently.",
      suggested_action: "Add seat order or deliberately leave blank if seat order is not required.",
      priority: "Low",
    },
    {
      issue: "Missing guest type",
      affected_records: guests.filter((guest) => !hasText(guest.guest_type)).length,
      why_it_matters: "Reduces ability to report by finalist, sponsor, nominator, guest and staff groups.",
      suggested_action: "Select a guest type from the dropdown.",
      priority: "Medium",
    },
    {
      issue: "Duplicate guest names",
      affected_records: duplicateRecordCount(guests.map((guest) => guest.full_name)),
      why_it_matters: "May indicate duplicate records or legitimate guests who need clearer identification.",
      suggested_action: "Review duplicate names and add organisation, party or notes to distinguish legitimate records.",
      priority: "Medium",
    },
    {
      issue: "Duplicate phone numbers",
      affected_records: duplicateRecordCount(guests.map((guest) => guest.phone)),
      why_it_matters: "May indicate duplicate records or shared contact details.",
      suggested_action: "Review duplicate contact details and confirm whether the records are intentional.",
      priority: "Low",
    },
    {
      issue: "Potential category wording variants",
      affected_records: categoryVariantCount(guests),
      why_it_matters: "Small wording differences can split category reports.",
      suggested_action: "Use a category dropdown or normalise existing category labels.",
      priority: "Medium",
    },
  ];

  return {
    rows: issueRows,
    columns: simpleColumns([
      ["issue", "Issue"],
      ["affected_records", "Affected records"],
      ["why_it_matters", "Why it matters"],
      ["suggested_action", "Suggested action"],
      ["priority", "Priority"],
    ]),
  };
}

function buildSeatingCompleteness(data) {
  const rows = tableGroups(data).map((table) => {
    const guests = table.guests || [];
    const capacity = numberValue(table.capacity);
    const assignedWithSeatOrder = guests.filter((guest) => hasText(guest.seat_sort_order)).length;
    return {
      table: table.table_number || "TBC",
      table_label: table.table_label || "TBC",
      capacity: capacity || "",
      assigned_guests: guests.length,
      expected_guests: guests.filter(isExpectedGuest).length,
      assigned_with_seat_order: assignedWithSeatOrder,
      missing_seat_order: guests.length - assignedWithSeatOrder,
      spare_or_over_capacity: capacity ? capacity - guests.length : "",
      assigned_status: guests.filter((guest) => guest.seating_status === "assigned").length,
      tbc_status: guests.filter((guest) => guest.seating_status === "tbc").length,
      unassigned_status: guests.filter((guest) => guest.seating_status === "unassigned").length,
      not_required_status: guests.filter((guest) => guest.seating_status === "not_required").length,
    };
  });

  return {
    rows,
    columns: simpleColumns([
      ["table", "Table"],
      ["table_label", "Table label"],
      ["capacity", "Capacity"],
      ["assigned_guests", "Assigned guests"],
      ["expected_guests", "Expected guests"],
      ["assigned_with_seat_order", "Assigned with seat order"],
      ["missing_seat_order", "Missing seat order"],
      ["spare_or_over_capacity", "Spare or over capacity"],
      ["assigned_status", "Assigned status"],
      ["tbc_status", "TBC status"],
      ["unassigned_status", "Unassigned status"],
      ["not_required_status", "Not required status"],
    ]),
  };
}

function buildPartyGroups(data) {
  const parties = new Map();
  (data.parties || []).forEach((party) => {
    parties.set(party.id, { party, guests: [] });
  });
  (data.guests || []).forEach((guest) => {
    if (!guest.party_id) return;
    if (!parties.has(guest.party_id)) parties.set(guest.party_id, { party: guest.guest_parties || { id: guest.party_id }, guests: [] });
    parties.get(guest.party_id).guests.push(guest);
  });

  const rows = [...parties.values()]
    .filter((group) => group.guests.length)
    .sort((a, b) => normaliseText(a.party.party_name || a.party.party_code).localeCompare(normaliseText(b.party.party_name || b.party.party_code)))
    .map((group) => {
      const arrived = group.guests.filter(isArrived).length;
      const size = group.guests.length;
      return {
        party_name: finalistSafeLabel(group.party.party_name || group.party.lead_guest_name || group.party.party_code || "Unnamed party"),
        party_code: finalistSafeLabel(group.party.party_code),
        party_size: size,
        arrived,
        not_arrived: group.guests.filter((guest) => guest.attendance_status === "not_arrived").length,
        completion_status: arrived === size ? "Complete" : arrived === 0 ? "Not arrived" : "Partial",
        tables: [...new Set(group.guests.map(guestTableLabel))].join(", "),
        lead_guest: finalistSafeLabel(group.party.lead_guest_name),
        organisation: finalistSafeLabel(group.party.organisation_name),
      };
    });

  return {
    rows,
    columns: simpleColumns([
      ["party_name", "Party name"],
      ["party_code", "Party code"],
      ["party_size", "Party size"],
      ["arrived", "Arrived"],
      ["not_arrived", "Not arrived"],
      ["completion_status", "Completion status"],
      ["tables", "Tables"],
      ["lead_guest", "Lead guest"],
      ["organisation", "Organisation"],
    ]),
  };
}

export function buildReportExport(key, data) {
  switch (key) {
    case "event-summary":
      return buildEventSummary(data);
    case "table-performance":
      return buildTablePerformance(data);
    case "arrival-timeline":
      return buildArrivalTimeline(data);
    case "device-staff-audit":
      return buildDeviceStaffAudit(data);
    case "no-show":
      return buildNoShow(data);
    case "operational-requirements":
      return buildOperationalRequirements(data);
    case "data-quality":
      return buildDataQuality(data);
    case "seating-completeness":
      return buildSeatingCompleteness(data);
    case "party-groups":
      return buildPartyGroups(data);
    default:
      return { rows: [], columns: [] };
  }
}

export function reportFilename(exportKey, key) {
  return `${exportKey}-${key}.csv`;
}
