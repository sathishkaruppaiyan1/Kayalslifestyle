// WATI WhatsApp API client, shared by every whatsapp-* edge function.
// whatsapp-send-otp, whatsapp-order-notification and the cashfree-* functions
// carry an inlined copy (the Dashboard editor can't resolve ../_shared);
// keep them in sync.
//
// Required secrets (supabase secrets set KEY=value):
//   WATI_API_ENDPOINT  - e.g. https://live-mt-server.wati.io/<tenant-id>
//   WATI_ACCESS_TOKEN  - from WATI > API Docs, with or without "Bearer "
// Optional template names (defaults in parentheses):
//   WATI_OTP_TEMPLATE    (kayals_otp)
//   WATI_ORDER_TEMPLATE  (kayals_order_confirmation)

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export interface TemplateButton {
  subType: 'url' | 'quick_reply' | 'copy_code';
  index: number;
  parameters: string[];
}

export interface SendTemplateArgs {
  to: string;
  template: string;
  languageCode?: string;
  headerValues?: string[];
  bodyValues?: string[];
  buttons?: TemplateButton[];
}

export interface SendResult {
  ok: boolean;
  status: number;
  messageId?: string;
  error?: string;
  raw: unknown;
}

/**
 * Normalise a number to the E.164 digits WhatsApp expects.
 * "+91 98765 43210", "09876543210", "919876543210" -> "919876543210"
 * A bare 10-digit number gets the default country code prepended.
 */
export function toWhatsAppNumber(phone: string, defaultCountry = '91'): string {
  let digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = defaultCountry + digits;
  return digits;
}

/** Strip a number down to the local 10-digit form used as the DB key. */
export function toLocalNumber(phone: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

// WATI names template variables ({{name}}, {{order_id}}, or {{1}} for
// Meta-imported templates), so positional bodyValues are mapped onto the
// template's own parameter names. Looked up once per function instance.
const watiParamNames = new Map<string, string[]>();

async function templateParamNames(
  endpoint: string,
  token: string,
  template: string,
): Promise<string[] | null> {
  const cached = watiParamNames.get(template);
  if (cached) return cached;
  try {
    const res = await fetch(`${endpoint}/api/v1/getMessageTemplates?pageSize=200`, {
      headers: { Authorization: token },
    });
    const data = await res.json();
    const match = (data?.messageTemplates ?? []).find(
      (t: Record<string, any>) => t.elementName === template && t.status !== 'DELETED',
    );
    if (!match) return null;
    const names = (match.customParams ?? []).map((p: Record<string, any>) => String(p.paramName));
    watiParamNames.set(template, names);
    return names;
  } catch (err) {
    console.error(`[whatsapp] could not read WATI template ${template}:`, err);
    return null;
  }
}

/**
 * Send an approved template through WATI.
 * Only body variables are sent: WATI fills button URLs and the OTP copy-code
 * button from the template itself, so `buttons` and `headerValues` are ignored.
 */
export async function sendTemplate(args: SendTemplateArgs): Promise<SendResult> {
  const endpoint = (Deno.env.get('WATI_API_ENDPOINT') || '').replace(/\/+$/, '');
  const rawToken = (Deno.env.get('WATI_ACCESS_TOKEN') || '').trim();

  if (!endpoint || !rawToken) {
    console.error('[whatsapp] missing WATI_API_ENDPOINT or WATI_ACCESS_TOKEN');
    return { ok: false, status: 500, error: 'WATI is not configured', raw: null };
  }
  const token = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;

  const values = (args.bodyValues ?? []).map((v) => String(v ?? ''));
  const names = values.length ? await templateParamNames(endpoint, token, args.template) : [];
  if (names === null) {
    const error = `WATI template "${args.template}" not found or not approved`;
    console.error(`[whatsapp] ${error}`);
    return { ok: false, status: 400, error, raw: null };
  }
  const parameters = values.map((value, i) => ({ name: names[i] ?? String(i + 1), value }));

  const to = toWhatsAppNumber(args.to);
  const url = `${endpoint}/api/v1/sendTemplateMessage?whatsappNumber=${to}`;
  console.log(`[whatsapp] -> ${args.template} to ${to}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_name: args.template,
      broadcast_name: args.template,
      parameters,
    }),
  });

  const raw = await response.text();
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { message: raw };
  }

  // WATI answers 200 with result:false for bad templates or non-WhatsApp numbers.
  if (!response.ok || parsed?.result === false || parsed?.validWhatsAppNumber === false) {
    // Validation errors come back as 400 {items: [{code, description}]}.
    const watiError =
      parsed?.items?.map((i: Record<string, any>) => i.description).join('; ') ||
      parsed?.info || parsed?.message ||
      (parsed?.validWhatsAppNumber === false ? 'Number is not on WhatsApp' : raw);
    const status = response.ok ? 400 : response.status;
    console.error(`[whatsapp] ${args.template} failed ${status}: ${watiError}`);
    return { ok: false, status, error: String(watiError), raw: parsed };
  }

  const messageId = parsed?.model?.ids?.[0] ?? parsed?.id;
  console.log(`[whatsapp] ${args.template} sent id=${messageId ?? '?'}`);
  return { ok: true, status: 200, messageId, raw: parsed };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
