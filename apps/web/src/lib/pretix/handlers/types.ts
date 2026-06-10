/** Resolved context handed to each inbound-pretix reconciliation handler. */
export interface ReconcileCtx {
  organizerSlug: string;
  pretixEventSlug: string;
  token?: string;
  orderCode: string;
  eventMappingId: string;
  organizationId: string;
}
