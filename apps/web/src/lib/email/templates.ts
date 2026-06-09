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
