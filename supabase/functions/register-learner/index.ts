import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://bemcrulearningcentre.co.ke",
  "https://www.bemcrulearningcentre.co.ke",
  "https://bemcrue.github.io",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://bemcrulearningcentre.co.ke";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  try {
    const body = await req.json();

    // Honeypot: silently reject bot submissions if the website adds this hidden field.
    if (typeof body.website === "string" && body.website.trim()) {
      return json({ ok: true }, 200, origin);
    }

    const required = [
      "student_name", "date_of_birth", "guardian_name", "guardian_phone",
      "guardian_email", "level", "school_name", "grade", "session",
      "preferred_start_date",
    ];
    for (const key of required) {
      if (typeof body[key] !== "string" || !body[key].trim()) {
        return json({ error: `Missing or invalid field: ${key}` }, 400, origin);
      }
    }
    if (!Array.isArray(body.subjects) || body.subjects.length === 0 ||
        !body.subjects.every((item: unknown) => typeof item === "string")) {
      return json({ error: "Select at least one subject." }, 400, origin);
    }
    if (body.consent !== true) return json({ error: "Consent is required." }, 400, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server configuration.");
      return json({ error: "Registration service is not configured yet." }, 500, origin);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const registration = {
      student_name: body.student_name.trim(),
      date_of_birth: body.date_of_birth.trim(),
      guardian_name: body.guardian_name.trim(),
      guardian_phone: body.guardian_phone.trim(),
      guardian_email: body.guardian_email.trim(),
      level: body.level.trim(),
      school_name: body.school_name.trim(),
      pathway: typeof body.pathway === "string" ? body.pathway.trim() : "",
      grade: body.grade.trim(),
      session: body.session.trim(),
      subjects: body.subjects.map((item: string) => item.trim()).filter(Boolean),
      preferred_start_date: body.preferred_start_date.trim(),
      payment_reference: typeof body.payment_reference === "string" ? body.payment_reference.trim() : "",
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
      consent: true,
      whatsapp_notification_status: "pending",
    };

    const { data: saved, error: insertError } = await supabase
      .from("registrations")
      .insert(registration)
      .select("id")
      .single();

    if (insertError || !saved) {
      console.error("Registration save failed:", insertError?.message ?? "No record returned");
      return json({ error: "We could not save your registration. Please try again." }, 500, origin);
    }

    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");
    const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "registration_alert";
    const recipient = Deno.env.get("WHATSAPP_RECIPIENT") || "254704514801";

    if (!token || !phoneNumberId || !apiVersion) {
      await supabase.from("registrations")
        .update({ whatsapp_notification_status: "failed" }).eq("id", saved.id);
      // The registration is safely saved even if WhatsApp isn't configured yet.
      return json({ ok: true, saved: true, notification: "not_configured", registrationId: saved.id }, 201, origin);
    }

    const template: Record<string, unknown> = {
      name: templateName,
      language: { code: "en_US" },
    };

    // Meta's built-in test template can verify delivery, but it does not include
    // registration details. Production should use an approved registration_alert
    // template with five body placeholders.
    if (templateName !== "hello_world") {
      template.components = [{
        type: "body",
        parameters: [
          { type: "text", text: registration.student_name },
          { type: "text", text: registration.grade },
          { type: "text", text: registration.guardian_name },
          { type: "text", text: registration.guardian_phone },
          { type: "text", text: registration.subjects.join(", ") },
        ],
      }];
    }

    let notificationSent = false;
    try {
      const waResponse = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient,
            type: "template",
            template,
          }),
        },
      );
      notificationSent = waResponse.ok;
      if (!waResponse.ok) {
        const errorBody = await waResponse.text();
        console.error("WhatsApp send failed with status", waResponse.status, errorBody.slice(0, 1000));
      }
    } catch (error) {
      console.error("WhatsApp request failed:", error instanceof Error ? error.message : "unknown error");
    }

    await supabase.from("registrations")
      .update({ whatsapp_notification_status: notificationSent ? "sent" : "failed" })
      .eq("id", saved.id);

    return json({
      ok: true,
      saved: true,
      notification: notificationSent ? "sent" : "failed",
      registrationId: saved.id,
    }, 201, origin);
  } catch (error) {
    console.error("Unexpected registration error:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "An unexpected error occurred. Please try again." }, 500, origin);
  }
});
