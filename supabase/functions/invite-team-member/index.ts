import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INVITE-TEAM-MEMBER] ${step}${detailsStr}`);
};

interface InviteRequest {
  email: string;
  first_name: string;
  last_name: string;
  account_id: string;
  role: 'driver' | 'primary_admin';
  can_view_all_routes?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Initialize Supabase client with service role (admin access)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      throw new Error(`Authentication error: ${userError.message}`);
    }

    const requestingUser = userData.user;
    if (!requestingUser) {
      throw new Error("User not authenticated");
    }
    logStep("Requesting user authenticated", { userId: requestingUser.id });

    // Verify requesting user is an admin
    const { data: requestingUserRole, error: roleError } = await supabaseClient
      .from('account_users')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();

    if (roleError || requestingUserRole?.role !== 'primary_admin') {
      throw new Error("Only admins can invite team members");
    }
    logStep("Admin permission verified");

    // Parse request body
    const body: InviteRequest = await req.json();
    const { email, first_name, last_name, account_id, role, can_view_all_routes = false } = body;

    // Validate required fields
    if (!email || !first_name || !last_name || !account_id || !role) {
      throw new Error("Missing required fields: email, first_name, last_name, account_id, role");
    }
    logStep("Request validated", { email, role });

    // PHASE GATE 1: Check seat availability
    const { data: seatCheck, error: seatError } = await supabaseClient
      .rpc('check_seat_availability', {
        p_account_id: account_id,
        p_role: role
      });

    if (seatError) {
      logStep("Seat check failed", { error: seatError.message });
      throw new Error(`Seat availability check failed: ${seatError.message}`);
    }

    const seatAvailability = Array.isArray(seatCheck) ? seatCheck[0] : seatCheck;

    if (!seatAvailability.can_add) {
      logStep("Seat limit reached", seatAvailability);
      return new Response(JSON.stringify({
        success: false,
        error: seatAvailability.reason,
        seat_info: {
          total_seats: seatAvailability.total_seats,
          used_seats: seatAvailability.used_seats,
          available_seats: seatAvailability.available_seats
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    logStep("Seat available", seatAvailability);

    // PHASE GATE 2: Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseClient.auth.admin.listUsers();

    if (listError) {
      throw new Error(`Failed to check existing users: ${listError.message}`);
    }

    const existingUser = existingUsers.users.find(u => u.email === email);
    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // BRANCH A: Update existing user
      logStep("User exists, updating metadata", { userId: existingUser.id });
      userId = existingUser.id;

      // Update user_metadata
      const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            first_name,
            last_name
          }
        }
      );

      if (updateError) {
        throw new Error(`Failed to update user metadata: ${updateError.message}`);
      }
      logStep("User metadata updated");

      // Upsert profile
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .upsert({
          id: userId,
          email,
          first_name,
          last_name
        }, {
          onConflict: 'id',
          ignoreDuplicates: false
        });

      if (profileError) {
        throw new Error(`Failed to upsert profile: ${profileError.message}`);
      }
      logStep("Profile upserted");

    } else {
      // BRANCH B: Create new user
      logStep("User does not exist, creating new user");
      isNewUser = true;

      const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
        email,
        email_confirm: false, // User will confirm via invite email
        user_metadata: {
          first_name,
          last_name
        }
      });

      if (createError) {
        throw new Error(`Failed to create user: ${createError.message}`);
      }

      if (!newUser.user) {
        throw new Error("User creation failed - no user returned");
      }

      userId = newUser.user.id;
      logStep("User created", { userId });

      // Insert profile
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .insert({
          id: userId,
          email,
          first_name,
          last_name
        });

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
      logStep("Profile created");
    }

    // PHASE GATE 3: Check if user is already in account_users
    const { data: existingAccountUser } = await supabaseClient
      .from('account_users')
      .select('id, role')
      .eq('account_id', account_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingAccountUser) {
      // Update existing account_users entry
      logStep("User already in account, updating role", { existingRole: existingAccountUser.role, newRole: role });

      const { error: updateRoleError } = await supabaseClient
        .from('account_users')
        .update({
          role,
          can_view_all_routes
        })
        .eq('id', existingAccountUser.id);

      if (updateRoleError) {
        throw new Error(`Failed to update account user role: ${updateRoleError.message}`);
      }
      logStep("Account user role updated");

    } else {
      // Insert into account_users
      const { error: accountUserError } = await supabaseClient
        .from('account_users')
        .insert({
          account_id,
          user_id: userId,
          role,
          can_view_all_routes
        });

      if (accountUserError) {
        throw new Error(`Failed to add user to account: ${accountUserError.message}`);
      }
      logStep("User added to account");
    }

    // Re-send invite email if existing user, or invite was already sent for new user
    if (!isNewUser) {
      const { error: inviteError } = await supabaseClient.auth.admin.inviteUserByEmail(email);

      if (inviteError) {
        logStep("Warning: Failed to send invite email", { error: inviteError.message });
        // Don't fail the whole operation if email fails
      } else {
        logStep("Invite email sent");
      }
    } else {
      logStep("Invite email automatically sent for new user");
    }

    // Success response
    return new Response(JSON.stringify({
      success: true,
      message: isNewUser ? "Team member invited successfully" : "Team member updated and re-invited",
      user: {
        id: userId,
        email,
        first_name,
        last_name,
        role,
        is_new_user: isNewUser
      },
      seat_info: {
        total_seats: seatAvailability.total_seats,
        used_seats: seatAvailability.used_seats + (isNewUser && role === 'driver' ? 1 : 0),
        available_seats: seatAvailability.available_seats - (isNewUser && role === 'driver' ? 1 : 0)
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in invite-team-member", { message: errorMessage });

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
