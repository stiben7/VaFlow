// The one place email actually leaves the building.
//
// Today: EmailJS REST API, sending through a connected Gmail account. EmailJS
// blocks non-browser calls unless "Allow EmailJS API for non-browser
// applications" is on (Account -> Security) and the private key is passed as
// `accessToken`.
//
// To move to Brevo / Resend / raw SMTP later, rewrite ONLY this function --
// nothing else in the reminders function knows how mail is sent.

export type Mail = { to: string; subject: string; html: string };

export async function sendEmail(mail: Mail): Promise<boolean> {
  if (Deno.env.get("REMINDERS_DRY_RUN") === "1") {
    console.log("DRY_RUN email", JSON.stringify({ to: mail.to, subject: mail.subject }));
    console.log(mail.html);
    return true;
  }

  const body = {
    service_id: Deno.env.get("EMAILJS_SERVICE_ID"),
    template_id: Deno.env.get("EMAILJS_TEMPLATE_ID"),
    user_id: Deno.env.get("EMAILJS_PUBLIC_KEY"),
    accessToken: Deno.env.get("EMAILJS_PRIVATE_KEY"),
    template_params: {
      to_email: mail.to,
      subject: mail.subject,
      content_html: mail.html,
    },
  };

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("emailjs send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("emailjs send threw", err);
    return false;
  }
}
