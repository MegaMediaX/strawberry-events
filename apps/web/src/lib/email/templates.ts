export type Locale = "en" | "ar";

export interface RenderedEmail {
  subject: string;
  text: string;
}

export function pendingEmail(
  locale: Locale,
  eventTitle: string,
  orderCode: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `طلب تسجيلك قيد المعالجة — ${eventTitle}`,
      text: `شكرًا لتسجيلك في ${eventTitle}.\nرمز الطلب: ${orderCode}\nسيتم إصدار تذكرتك بعد تأكيد الدفع.`,
    };
  }
  return {
    subject: `Registration received — ${eventTitle}`,
    text: `Thanks for registering for ${eventTitle}.\nOrder code: ${orderCode}\nYour ticket will be issued once payment is confirmed.`,
  };
}

export function pendingApprovalEmail(
  locale: Locale,
  eventTitle: string,
  orderCode: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `طلبك قيد المراجعة — ${eventTitle}`,
      text: `استلمنا تسجيلك في ${eventTitle} وهو قيد مراجعة المنظّم.\nرمز الطلب: ${orderCode}\nسنعلمك عند الموافقة.`,
    };
  }
  return {
    subject: `Your registration is under review — ${eventTitle}`,
    text: `We received your registration for ${eventTitle}; it's awaiting organizer approval.\nOrder code: ${orderCode}\nWe'll email you once it's reviewed.`,
  };
}

export function approvedPaymentEmail(
  locale: Locale,
  eventTitle: string,
  orderCode: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `تمت الموافقة — الدفع مطلوب — ${eventTitle}`,
      text: `تمت الموافقة على تسجيلك في ${eventTitle}.\nرمز الطلب: ${orderCode}\nيرجى إكمال الدفع لإصدار التذكرة.`,
    };
  }
  return {
    subject: `Approved — payment required — ${eventTitle}`,
    text: `Your registration for ${eventTitle} is approved.\nOrder code: ${orderCode}\nPlease complete payment to receive your ticket.`,
  };
}

export function rejectedEmail(
  locale: Locale,
  eventTitle: string,
  orderCode: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `تعذّر قبول تسجيلك — ${eventTitle}`,
      text: `نأسف، لم تتم الموافقة على تسجيلك في ${eventTitle}.\nرمز الطلب: ${orderCode}`,
    };
  }
  return {
    subject: `Your registration was not approved — ${eventTitle}`,
    text: `We're sorry — your registration for ${eventTitle} was not approved.\nOrder code: ${orderCode}`,
  };
}

export function confirmationEmail(
  locale: Locale,
  eventTitle: string,
  orderCode: string,
  ticketUrl: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `تذكرتك إلى ${eventTitle}`,
      text: `تم تأكيد تسجيلك في ${eventTitle}.\nرمز الطلب: ${orderCode}\nتذكرتك: ${ticketUrl}`,
    };
  }
  return {
    subject: `Your ticket to ${eventTitle}`,
    text: `Your registration for ${eventTitle} is confirmed.\nOrder code: ${orderCode}\nYour ticket: ${ticketUrl}`,
  };
}
