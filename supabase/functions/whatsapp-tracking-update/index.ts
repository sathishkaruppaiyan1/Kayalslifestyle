import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, sendTemplate } from "../_shared/whatsapp.ts";

type OrderStatus = 'confirmed' | 'shipped' | 'out_for_delivery' | 'delivered';

// Meta validates the parameter count against the approved template, so each
// status has a FIXED number of body values with defaults filled in. Sending a
// variable-length list (as the Interakt version did) fails with error 132000.
const TEMPLATES: Record<OrderStatus, string> = {
  confirmed: 'order_confirmed',
  shipped: 'order_shipped',
  out_for_delivery: 'order_out_for_delivery',
  delivered: 'order_delivered',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      phoneNumber,
      customerName,
      orderId,
      trackingNumber,
      courierName,
      orderStatus,
      estimatedDelivery,
    } = await req.json();

    if (!phoneNumber || !customerName || !orderId || !orderStatus) {
      return json(
        {
          error:
            'Missing required fields: phoneNumber, customerName, orderId, orderStatus',
        },
        400,
      );
    }

    const template = TEMPLATES[orderStatus as OrderStatus];
    if (!template) {
      return json(
        { error: `Unknown orderStatus "${orderStatus}"`, allowed: Object.keys(TEMPLATES) },
        400,
      );
    }

    const name = String(customerName).trim() || 'Customer';
    const order = String(orderId).trim();

    let bodyValues: string[];
    switch (orderStatus as OrderStatus) {
      case 'shipped':
        bodyValues = [
          name,
          order,
          String(courierName || 'our courier partner'),
          String(trackingNumber || order),
          String(estimatedDelivery || '3-5 business days'),
        ];
        break;
      case 'out_for_delivery':
        bodyValues = [name, order, String(estimatedDelivery || 'today')];
        break;
      default:
        bodyValues = [name, order];
    }

    // Templates for shipped / out_for_delivery carry a dynamic URL button whose
    // base is https://blacklovers.in/track?id={{1}} - Meta wants only the
    // variable part, never a whole URL.
    const buttons =
      orderStatus === 'shipped' || orderStatus === 'out_for_delivery'
        ? [{ subType: 'url' as const, index: 0, parameters: [String(trackingNumber || order)] }]
        : undefined;

    const result = await sendTemplate({
      to: phoneNumber,
      template,
      languageCode: 'en',
      bodyValues,
      buttons,
    });

    if (!result.ok) {
      return json(
        { error: 'Failed to send tracking update', details: result.error },
        result.status,
      );
    }

    return json({ success: true, messageId: result.messageId, data: result.raw });
  } catch (error: unknown) {
    console.error('Error sending tracking update:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
