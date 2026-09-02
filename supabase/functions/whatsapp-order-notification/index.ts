import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, sendTemplate } from "../_shared/whatsapp.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, customerName, orderId, amount, currency } = await req.json();

    if (!phoneNumber || !customerName || !orderId) {
      return json(
        { error: 'Missing required fields: phoneNumber, customerName, orderId' },
        400,
      );
    }

    const name = String(customerName).trim() || 'Customer';
    const order = String(orderId).trim() || 'Order';
    const cur = currency && String(currency).trim() ? String(currency).trim() : '₹';
    const amt = amount !== undefined && amount !== null && String(amount).trim()
      ? String(amount).trim()
      : '0';

    const result = await sendTemplate({
      to: phoneNumber,
      template: 'order_cnf_as',
      languageCode: 'en',
      // {{1}} name  {{2}} order id  {{3}} currency  {{4}} amount
      bodyValues: [name, order, cur, amt],
      // Template's URL button is https://blacklovers.in/track?id={{1}}
      buttons: [{ subType: 'url', index: 0, parameters: [order] }],
    });

    if (!result.ok) {
      return json(
        { error: 'Failed to send order notification', details: result.error },
        result.status,
      );
    }

    return json({ success: true, messageId: result.messageId, data: result.raw });
  } catch (error: unknown) {
    console.error('Error in whatsapp-order-notification:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
