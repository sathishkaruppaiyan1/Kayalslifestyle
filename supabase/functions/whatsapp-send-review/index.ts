import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, sendTemplate } from "../_shared/whatsapp.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, customerName, productName, orderId, productId } =
      await req.json();

    if (!phoneNumber || !customerName || !productName || !orderId) {
      return json(
        {
          error:
            'Missing required fields: phoneNumber, customerName, productName, orderId',
        },
        400,
      );
    }

    const result = await sendTemplate({
      to: phoneNumber,
      template: 'review_request',
      languageCode: 'en',
      // {{1}} name  {{2}} product name  {{3}} order id
      bodyValues: [String(customerName), String(productName), String(orderId)],
      // Template's URL button is https://blacklovers.in/product/{{1}}
      buttons: [{ subType: 'url', index: 0, parameters: [String(productId || orderId)] }],
    });

    if (!result.ok) {
      return json(
        { error: 'Failed to send review request', details: result.error },
        result.status,
      );
    }

    return json({ success: true, messageId: result.messageId, data: result.raw });
  } catch (error: unknown) {
    console.error('Error sending review request:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
