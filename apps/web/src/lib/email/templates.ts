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
    text: `You've been invited to join ${orgName} on the Strawberry Agency Events platform.\nTo set your password and activate your account, open this link (valid for 7 days):\n${inviteUrl}\nIf you weren't expecting this invitation, you can ignore this email.`,
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

/**
 * Sent when someone submits the signup form for an address that ALREADY has an
 * account. The form answers identically either way, so this mail is the only
 * place the difference surfaces — and it surfaces to the mailbox owner, who is
 * entitled to know, rather than to whoever typed the address.
 */
export function accountExistsEmail(
  locale: Locale,
  loginUrl: string,
  resetUrl: string,
): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: "لديك حساب بالفعل",
      text:
        "حاول أحدهم إنشاء حساب بهذا البريد الإلكتروني، ولديك حساب بالفعل.\n" +
        `لتسجيل الدخول: ${loginUrl}\n` +
        `نسيت كلمة المرور؟ ${resetUrl}\n` +
        "لم يتغير شيء في حسابك. إذا لم تكن أنت، تجاهل هذه الرسالة.",
    };
  }
  return {
    subject: "You already have an account",
    text:
      "Someone tried to create an account with this email address, and you already have one.\n" +
      `Sign in: ${loginUrl}\n` +
      `Forgot your password? ${resetUrl}\n` +
      "Nothing about your account has changed. If this wasn't you, you can ignore this email.",
  };
}


/**
 * The signup verification code.
 *
 * A CODE, not a link, on purpose: corporate mail scanners (Microsoft Defender,
 * Google Safe Browsing and friends) pre-fetch every URL in an inbound message,
 * which would verify the address before the recipient had even opened it — and
 * this platform's audience is largely corporate. A code cannot be clicked by a
 * scanner. It also matches the shape the claim flow will need later, so there
 * is one ceremony and one attempt-lockout to reason about rather than two.
 */
export function verifyEmailCodeEmail(locale: Locale, code: string): RenderedEmail {
  if (locale === "ar") {
    return {
      subject: `رمز التحقق: ${code}`,
      text:
        `رمز التحقق الخاص بك هو ${code}\n` +
        "صالح لمدة 10 دقائق.\n" +
        "إذا لم تطلب إنشاء حساب، تجاهل هذه الرسالة — لم يتم تفعيل أي شيء.",
    };
  }
  return {
    subject: `Your verification code: ${code}`,
    text:
      `Your verification code is ${code}\n` +
      "It expires in 10 minutes.\n" +
      "If you didn't try to create an account, ignore this email — nothing has been activated.",
  };
}

/**
 * Sent to the address ON THE REGISTRATION whenever it is attached to an
 * account — never only to the claimant.
 *
 * CLAUDE.md records that a second notification channel was declined and that
 * "the merge notice is email-only", accepting the risk that whoever controls a
 * corporate mailbox can delete the only warning. That risk was accepted against
 * a control that did not exist: nothing sent a notice at all. This is it.
 *
 * It matters most in the case nobody attacks on purpose. Ticket links never
 * expire, by deliberate design, so a forwarded confirmation email — to an
 * assistant, a colleague, an events alias — can be opened months later by
 * someone who then owns the registration permanently. Without this mail, the
 * person it belonged to is never told.
 *
 * The claiming address is MASKED. The recipient needs to recognise it or fail
 * to; they do not need a stranger's full address, and on a shared mailbox that
 * would hand one colleague another's.
 */
/**
 * One notice for a whole sweep, not one per registration.
 *
 * Every order in a verification sweep matched the SAME address, so a per-order
 * notice would put N identical mails in one inbox. Listing them in a single
 * message is also the more useful record: it says exactly what moved.
 *
 * No masked address here, unlike registrationClaimedEmail. On this path the
 * claimant's address IS the order's address, so masking it would only tell the
 * reader something they already know.
 */
export function registrationsClaimedEmail(
  locale: Locale,
  params: { orderCodes: string[]; eventNames: string[] },
): RenderedEmail {
  const { orderCodes, eventNames } = params;
  const n = orderCodes.length;
  const list = orderCodes.map((c, i) => `- ${c}${eventNames[i] ? ` (${eventNames[i]})` : ""}`).join("\n");

  if (locale === "ar") {
    return {
      subject: n === 1 ? `تم ربط تسجيل بحسابك` : `تم ربط ${n} تسجيلات بحسابك`,
      text:
        `تم تأكيد هذا البريد، ورُبطت التسجيلات التالية بحسابك:\n\n${list}\n\n` +
        "تذاكرك ورموز الدخول لم تتغيّر.\n\n" +
        "إذا كان أحد هذه التسجيلات يخصّ شخصًا آخر يستخدم هذا البريد، رُدّ على هذه الرسالة وسنلغي الربط.",
    };
  }
  return {
    subject: n === 1 ? "A registration was linked to your account" : `${n} registrations were linked to your account`,
    text:
      `You just verified this email address, so the registrations below were linked to your account:\n\n${list}\n\n` +
      "Your tickets and entry QR codes have not changed.\n\n" +
      "If any of these belong to someone else who uses this mailbox, reply to this message and we will unlink it.",
  };
}

export function registrationClaimedEmail(
  locale: Locale,
  params: { orderCode: string; eventName: string; maskedEmail: string },
): RenderedEmail {
  const { orderCode, eventName, maskedEmail } = params;

  if (locale === "ar") {
    return {
      subject: `تم ربط تسجيلك (${orderCode}) بحساب`,
      text:
        `تم ربط تسجيلك في ${eventName} (رمز الطلب ${orderCode}) بحساب على ${maskedEmail}.\n\n` +
        "تذكرتك ورمز الدخول لم يتغيّرا.\n\n" +
        "إذا لم تكن أنت — مثلاً إذا حوّلت رسالة تذكرتك إلى شخص آخر — رُدّ على هذه الرسالة وسنلغي الربط.",
    };
  }
  return {
    subject: `Your registration ${orderCode} was linked to an account`,
    text:
      `Your registration for ${eventName} (order ${orderCode}) was just linked to an account for ${maskedEmail}.\n\n` +
      "Your ticket and entry QR code have not changed.\n\n" +
      "If this wasn't you — for example if you forwarded your ticket email to someone — reply to this message and we will unlink it.",
  };
}
