import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, sendTemplate, toLocalNumber } from "../_shared/whatsapp.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return json({ error: 'Supabase credentials not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { phoneNumber, countryCode = '+91' } = await req.json();

    if (!phoneNumber) {
      return json({ error: 'Phone number is required' }, 400);
    }

    const localPhone = toLocalNumber(phoneNumber);
    if (localPhone.length !== 10) {
      return json({ error: 'Please enter a valid 10-digit phone number' }, 400);
    }

    const cc = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
    const phoneKey = `${cc}${localPhone}`;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const { error: dbError } = await supabase.from('otps').upsert(
      {
        phone_number: localPhone,
        phone_key: phoneKey,
        otp,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number' },
    );

    if (dbError) {
      console.error('Error storing OTP:', dbError);
    }

    // Authentication templates carry the code twice: once in the body and once
    // in the copy-code button. Meta rejects the send if the two differ.
    const result = await sendTemplate({
      to: phoneKey,
      template: 'otp_auth',
      languageCode: 'en',
      bodyValues: [otp],
      buttons: [{ subType: 'url', index: 0, parameters: [otp] }],
    });

    if (!result.ok) {
      return json(
        {
          success: false,
          error: 'Failed to send OTP via WhatsApp',
          details: result.error,
          phoneNumber: localPhone,
        },
        400,
      );
    }

    return json({
      success: true,
      message: 'OTP sent successfully to your WhatsApp',
      phoneNumber: localPhone,
      messageId: result.messageId,
    });
  } catch (error: unknown) {
    console.error('Error in send OTP:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
