import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_id, password } = await req.json();

    // Basic input validation
    if (!user_id || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmedUserId = String(user_id).trim();
    const trimmedPassword = String(password).trim();

    // Sanitize: reject if too long (basic DoS protection)
    if (trimmedUserId.length > 100 || trimmedPassword.length > 200) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://bbdyexsaqnlremprfmph.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseServiceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is missing in Edge Function environment.');
      return new Response(
        JSON.stringify({ success: false, error: 'service_key_missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create an admin client with service_role key (server-side ONLY)
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Step 1: Check if this user exists in users table
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id, user_id, name, role, auth_id, password')
      .eq('user_id', trimmedUserId)
      .single();

    if (existingError || !existingUser) {
      console.error('User lookup error:', existingError?.message || 'User not found');
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_credentials', debug: existingError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: If auth_id already set, they have already migrated
    if (existingUser.auth_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'already_migrated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Validate plaintext password against legacy users table
    if (String(existingUser.password).trim() !== trimmedPassword) {
      console.error('Password mismatch for user:', trimmedUserId);
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Create Supabase Auth account for this user
    const email = trimmedUserId + '@gradely.app';
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: trimmedPassword,
      email_confirm: true,
      user_metadata: {
        user_id: existingUser.user_id,
        name: existingUser.name,
        role: existingUser.role,
      },
    });

    if (createError || !authData || !authData.user) {
      console.error('Failed to create auth user:', createError);
      return new Response(
        JSON.stringify({ success: false, error: 'migration_failed', detail: createError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Link auth.users.id to users.auth_id
    const { error: linkError } = await supabaseAdmin
      .from('users')
      .update({ auth_id: authData.user.id })
      .eq('user_id', trimmedUserId);

    if (linkError) {
      console.error('Failed to link auth_id:', linkError);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ success: false, error: 'migration_failed', detail: linkError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 6: Return success - frontend will now call signInWithPassword
    return new Response(
      JSON.stringify({ success: true, email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'server_error', message: error?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
