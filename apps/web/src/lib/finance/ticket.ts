import type { AttendeeOrderStatus } from "@prisma/client";

/** A ticket (QR) is only issued/downloadable once the order is paid. */
export function isTicketIssued(status: AttendeeOrderStatus): boolean {
  return status === "paid";
}
