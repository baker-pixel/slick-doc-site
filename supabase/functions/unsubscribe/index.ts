import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const token = url.searchParams.get('token');
  const action = url.searchParams.get('action') || 'unsubscribe';

  console.log(`Unsubscribe request: email=${email}, action=${action}`);

  if (!email) {
    return new Response('Email parameter required', { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  // Simple token validation (base64 of email)
  const expectedToken = btoa(email);
  if (token !== expectedToken) {
    console.log('Invalid unsubscribe token');
    return new Response('Invalid token', { 
      status: 403, 
      headers: corsHeaders 
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    if (action === 'unsubscribe') {
      // One-click unsubscribe
      const { error } = await supabase
        .from('email_preferences')
        .upsert({
          email: email.toLowerCase(),
          subscribed: false,
          unsubscribed_at: new Date().toISOString(),
          preferences: { marketing: false, transactional: true, sequences: false }
        }, { onConflict: 'email' });

      if (error) throw error;

      console.log(`Successfully unsubscribed: ${email}`);

      // Return a simple HTML confirmation page
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Unsubscribed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; }
            .container { text-align: center; padding: 40px; max-width: 500px; }
            h1 { color: #10b981; margin-bottom: 16px; }
            p { color: #94a3b8; line-height: 1.6; }
            a { color: #3b82f6; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .btn { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #3b82f6; color: white; border-radius: 8px; text-decoration: none; }
            .btn:hover { background: #2563eb; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Successfully Unsubscribed</h1>
            <p>You've been unsubscribed from our marketing emails.</p>
            <p>You'll still receive important transactional emails about your account.</p>
            <a href="${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app') || '/'}/email-preferences?email=${encodeURIComponent(email)}&token=${token}" class="btn">Manage Preferences</a>
          </div>
        </body>
        </html>
      `;

      return new Response(html, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });

    } else if (action === 'resubscribe') {
      // Resubscribe
      const { error } = await supabase
        .from('email_preferences')
        .upsert({
          email: email.toLowerCase(),
          subscribed: true,
          unsubscribed_at: null,
          preferences: { marketing: true, transactional: true, sequences: true }
        }, { onConflict: 'email' });

      if (error) throw error;

      console.log(`Successfully resubscribed: ${email}`);

      return new Response(JSON.stringify({ success: true, message: 'Resubscribed successfully' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'preferences') {
      // Get current preferences
      const { data, error } = await supabase
        .from('email_preferences')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return new Response(JSON.stringify({ 
        success: true, 
        preferences: data || { 
          email: email.toLowerCase(), 
          subscribed: true, 
          preferences: { marketing: true, transactional: true, sequences: true } 
        } 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'update') {
      // Update preferences from POST body
      const body = await req.json();
      
      const { error } = await supabase
        .from('email_preferences')
        .upsert({
          email: email.toLowerCase(),
          subscribed: body.subscribed ?? true,
          unsubscribed_at: body.subscribed === false ? new Date().toISOString() : null,
          preferences: body.preferences || { marketing: true, transactional: true, sequences: true }
        }, { onConflict: 'email' });

      if (error) throw error;

      console.log(`Updated preferences for: ${email}`);

      return new Response(JSON.stringify({ success: true, message: 'Preferences updated' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Invalid action', { status: 400, headers: corsHeaders });

  } catch (error: any) {
    console.error('Unsubscribe error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
