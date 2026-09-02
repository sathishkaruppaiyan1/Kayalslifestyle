import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, toLocalNumber } from "../_shared/whatsapp.ts";

// Verification is provider-agnostic: it only reads the OTP this project stored
// when the code was sent, so nothing here talks to Meta.
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
    const { phoneNumber, otp, name, email } = await req.json();

    if (!phoneNumber || !otp) {
      return json({ error: 'Phone number and OTP are required' }, 400);
    }

    const localPhone = toLocalNumber(phoneNumber);
    const phoneKey = `+91${localPhone}`;

    // phone_key is the newer column; fall back to phone_number for older rows.
    let { data: otpData, error: otpError } = await supabase
      .from('otps')
      .select('*')
      .eq('phone_key', phoneKey)
      .maybeSingle();

    if (otpError || !otpData) {
      const { data, error } = await supabase
        .from('otps')
        .select('*')
        .eq('phone_number', localPhone)
        .maybeSingle();

      if (!error && data) {
        otpData = data;
        otpError = null;
      } else {
        otpError = error;
      }
    }

    if (otpError || !otpData) {
      return json({ error: 'OTP not found. Please request a new OTP.' }, 404);
    }

    const deleteOtp = () =>
      otpData.phone_key
        ? supabase.from('otps').delete().eq('phone_key', otpData.phone_key)
        : supabase.from('otps').delete().eq('phone_number', localPhone);

    if (new Date(otpData.expires_at) < new Date()) {
      await deleteOtp();
      return json({ error: 'OTP has expired. Please request a new OTP.' }, 400);
    }

    if (otpData.otp !== otp) {
      return json({ error: 'Invalid OTP. Please try again.' }, 400);
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert(
        {
          phone_number: localPhone,
          name: name || `User ${localPhone}`,
          email: email || null,
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone_number' },
      )
      .select()
      .single();

    if (userError) {
      console.error('Error creating/updating user:', userError);
    }

    // One-time use
    await deleteOtp();

    const sessionToken = btoa(
      JSON.stringify({
        phoneNumber: localPhone,
        userId: userData?.id || localPhone,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }),
    );

    return json({
      success: true,
      message: 'Login successful',
      user: {
        phoneNumber: localPhone,
        name: userData?.name || name || `User ${localPhone}`,
        email: userData?.email || email,
      },
      sessionToken,
    });
  } catch (error: unknown) {
    console.error('Error in verify OTP:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
