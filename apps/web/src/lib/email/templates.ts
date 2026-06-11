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

export function waitlistPromotedEmail(
  locale: Locale,
  eventTitle: string,
  registerUrl: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `توفّر مكان لك — ${eventTitle}`,
      text: `أصبح هناك مكان متاح في ${eventTitle}!\nأكمل تسجيلك: ${registerUrl}`,
    };
  }
  return {
    subject: `A spot opened up — ${eventTitle}`,
    text: `Good news — a spot is now available for ${eventTitle}.\nComplete your registration: ${registerUrl}`,
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

export function userInviteEmail(
  locale: Locale,
  inviteUrl: string,
  orgName: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `دعوة للانضمام إلى ${orgName}`,
      text: `تمت دعوتك للانضمام إلى ${orgName} على منصة سترّوبري للفعاليات.\nلتعيين كلمة المرور وتفعيل حسابك، افتح الرابط التالي (صالح لمدة 7 أيام):\n${inviteUrl}\nإذا لم تكن تتوقع هذه الدعوة، تجاهل هذه الرسالة.`,
    };
  }
  return {
    subject: `You've been invited to ${orgName}`,
    text: `You've been invited to join ${orgName} on the Strawberry Events platform.\nTo set your password and activate your account, open this link (valid for 7 days):\n${inviteUrl}\nIf you weren't expecting this invitation, you can ignore this email.`,
  };
}

export function orderCanceledEmail(
  locale: Locale,
  eventTitle: string,
  orderCode: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `تم إلغاء تسجيلك — ${eventTitle}`,
      text: `نعلمك بأنه تم إلغاء تسجيلك في ${eventTitle}.\nرمز الطلب: ${orderCode}\nلم تعد تذكرتك صالحة. إذا كان لديك استفسار، يرجى التواصل مع المنظّم.`,
    };
  }
  return {
    subject: `Your registration was canceled — ${eventTitle}`,
    text: `Your registration for ${eventTitle} has been canceled.\nOrder code: ${orderCode}\nYour ticket is no longer valid. If you have questions, please contact the organizer.`,
  };
}

export function inviteEmail(
  locale: Locale,
  eventTitle: string,
  inviteUrl: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `دعوة شخصية للتسجيل في ${eventTitle}`,
      text: `تمت دعوتك للتسجيل في ${eventTitle}.\nهذا الرابط شخصي وللاستخدام مرة واحدة فقط — لا تشاركه مع أحد:\n${inviteUrl}\nإذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.`,
    };
  }
  return {
    subject: `You're invited to register for ${eventTitle}`,
    text: `You've been personally invited to register for ${eventTitle}.\nThis link is for you only and can be used once — please do not share it:\n${inviteUrl}\nIf you weren't expecting this, you can ignore this email.`,
  };
}

export function passwordResetEmail(locale: Locale, resetUrl: string): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: "إعادة تعيين كلمة المرور",
      text: `لإعادة تعيين كلمة المرور، افتح الرابط التالي (صالح لمدة ساعة واحدة):\n${resetUrl}\nإذا لم تطلب ذلك، تجاهل هذه الرسالة.`,
    };
  }
  return {
    subject: "Reset your password",
    text: `To reset your password, open this link (valid for 1 hour):\n${resetUrl}\nIf you didn't request this, you can ignore this email.`,
  };
}
