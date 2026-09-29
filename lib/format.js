export function normaliseText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function tableLabel(guest) {
  const tableNumber = guest?.event_tables?.table_number;
  if (!tableNumber) return "TBC";
  return `Table ${tableNumber}`;
}

export function statusLabel(status) {
  const labels = {
    arrived: "Arrived",
    not_arrived: "Not arrived",
    not_attending: "Not attending",
    cancelled: "Cancelled",
  };
  return labels[status] || normaliseText(status);
}

export function confirmationLabel(status) {
  const labels = {
    confirmed: "Confirmed",
    unconfirmed: "Unconfirmed",
    declined: "Declined",
    waitlist: "Waiting list",
    tbc: "TBC",
  };
  return labels[status] || normaliseText(status);
}

export function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
