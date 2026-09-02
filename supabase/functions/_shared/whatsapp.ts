// Meta WhatsApp Cloud API client, shared by every whatsapp-* edge function.
//
// Required secrets (supabase secrets set KEY=value):
//   WHATSAPP_ACCESS_TOKEN    - System User permanent token
//   WHATSAPP_PHONE_NUMBER_ID - Phone number ID from WhatsApp Manager
// Optional:
//   WHATSAPP_API_VERSION     - Graph API version (default v21.0)

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
 * Normalise a number to the E.164 digits Meta expects.
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

function textParams(values: string[]) {
  return values.map((v) => ({ type: 'text', text: String(v ?? '') }));
}

export async function sendTemplate(args: SendTemplateArgs): Promise<SendResult> {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const version = Deno.env.get('WHATSAPP_API_VERSION') || 'v21.0';

  if (!token || !phoneNumberId) {
    console.error('[whatsapp] missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return {
      ok: false,
      status: 500,
      error: 'WhatsApp Cloud API is not configured',
      raw: null,
    };
  }

  const components: Record<string, unknown>[] = [];

  if (args.headerValues?.length) {
    components.push({ type: 'header', parameters: textParams(args.headerValues) });
  }
  if (args.bodyValues?.length) {
    components.push({ type: 'body', parameters: textParams(args.bodyValues) });
  }
  for (const button of args.buttons ?? []) {
    components.push({
      type: 'button',
      sub_type: button.subType,
      index: String(button.index),
      parameters:
        button.subType === 'copy_code'
          ? button.parameters.map((v) => ({ type: 'coupon_code', coupon_code: String(v) }))
          : textParams(button.parameters),
    });
  }

  const to = toWhatsAppNumber(args.to);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: args.template,
      language: { code: args.languageCode || 'en' },
      ...(components.length ? { components } : {}),
    },
  };

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  console.log(`[whatsapp] -> ${args.template} to ${to}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { message: raw };
  }

  if (!response.ok) {
    // Meta buries the useful part under error.error_data.details
    const metaError =
      parsed?.error?.error_data?.details || parsed?.error?.message || raw;
    console.error(`[whatsapp] ${args.template} failed ${response.status}: ${metaError}`);
    return { ok: false, status: response.status, error: metaError, raw: parsed };
  }

  const messageId = parsed?.messages?.[0]?.id;
  console.log(`[whatsapp] ${args.template} sent id=${messageId}`);
  return { ok: true, status: 200, messageId, raw: parsed };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
