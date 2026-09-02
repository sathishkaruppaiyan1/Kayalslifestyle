import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, sendTemplate } from "../_shared/whatsapp.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, customerName } = await req.json();

    if (!phoneNumber || !customerName) {
      return json({ error: 'Missing required fields: phoneNumber, customerName' }, 400);
    }

    // The Cloud API has no contact-book to sync into - the send itself is the
    // whole operation, unlike Interakt's separate /track/users call.
    const result = await sendTemplate({
      to: phoneNumber,
      template: 'welcome_message',
      languageCode: 'en',
      // {{1}} customer name. The template's button is a STATIC url to
      // https://blacklovers.in, so it takes no parameter.
      bodyValues: [String(customerName).trim() || 'there'],
    });

    if (!result.ok) {
      return json(
        { error: 'Failed to send welcome message', details: result.error },
        result.status,
      );
    }

    return json({ success: true, messageId: result.messageId, data: result.raw });
  } catch (error: unknown) {
    console.error('Error sending welcome message:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
