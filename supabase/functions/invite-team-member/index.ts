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

// Retry helper for email send (handles transient failures)
async function sendInviteWithRetry(
  supabaseClient: any,
  email: string,
  inviteData: any,
  maxRetries = 3
): Promise<{ success: boolean; error?: any }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logStep(`Email send attempt ${attempt}/${maxRetries}`, { email });

    const { error } = await supabaseClient.auth.admin.inviteUserByEmail(email, inviteData);

    if (!error) {
      logStep(`Email sent successfully on attempt ${attempt}`, { email });
      return { success: true };
    }

    logStep(`Email send failed on attempt ${attempt}`, { error: error.message });

    // If not last attempt, wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      logStep(`Waiting ${delayMs}ms before retry ${attempt + 1}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } else {
      // All retries exhausted
      logStep(`All ${maxRetries} email attempts failed`, { finalError: error.message });
      return { success: false, error };
    }
  }

  return { success: false, error: new Error("Max retries reached") };
}

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

    // Get admin profile for email template
    const { data: adminProfile, error: adminProfileError } = await supabaseClient
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', requestingUser.id)
      .single();

    if (adminProfileError || !adminProfile) {
      throw new Error("Failed to fetch admin profile");
    }

    const adminName = `${adminProfile.first_name || ''} ${adminProfile.last_name || ''}`.trim() || 'Your Team Admin';
    const adminEmail = adminProfile.email;
    logStep("Admin profile fetched", { adminName, adminEmail });

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

    // PHASE GATE 3.5: Send invite email with retry logic
    const inviteData = {
      data: {
        admin_name: adminName,
        admin_email: adminEmail,
        first_name,
        last_name,
        role
      },
      redirectTo: `${Deno.env.get("SITE_URL") || "https://my-stocker-ai.com"}/auth/callback?type=invite`
    };

    if (!isNewUser) {
      // Re-send invite email for existing user
      logStep("Sending invite email to existing user with admin info", { adminName });

      const retryResult = await sendInviteWithRetry(supabaseClient, email, inviteData);

      if (!retryResult.success) {
        // CRITICAL: Email failed after 3 retries - exit BEFORE billing update
        logStep("CRITICAL: Failed to send invite email after retries - NO CHARGE APPLIED", {
          error: retryResult.error?.message,
          userId,
          email
        });

        return new Response(JSON.stringify({
          success: true, // User operation succeeded
          warning: `User role updated but invite email failed: ${retryResult.error?.message || 'Unknown error'}. User was NOT charged.`,
          userId,
          isNewUser: false,
          emailFailed: true,
          chargeApplied: false,
          action_required: "Resend invite email from Teams page to complete onboarding and apply billing."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200 // 200 because user operation succeeded, email is secondary
        });
      }

      logStep("Invite email sent successfully to existing user", { adminName });

    } else {
      // For new users, update the user to trigger invite with proper data
      const { error: updateError } = await supabaseClient.auth.admin.updateUserById(userId, {
        email_confirm: false // Ensure they need to confirm via invite
      });

      if (updateError) {
        logStep("Warning: Failed to update user before invite", { error: updateError.message });
      }

      // Now send invite with template data
      logStep("Sending invite email to new user with admin info", { adminName });

      const retryResult = await sendInviteWithRetry(supabaseClient, email, inviteData);

      if (!retryResult.success) {
        // CRITICAL: Email failed after 3 retries - exit BEFORE billing update
        logStep("CRITICAL: Failed to send invite email after retries - NO CHARGE APPLIED", {
          error: retryResult.error?.message,
          userId,
          email
        });

        return new Response(JSON.stringify({
          success: true, // User was created successfully
          warning: `User created but invite email failed: ${retryResult.error?.message || 'Unknown error'}. User was NOT charged.`,
          userId,
          isNewUser: true,
          emailFailed: true,
          chargeApplied: false,
          action_required: "User exists but cannot login. Resend invite from Teams page to complete onboarding and apply billing."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      logStep("Invite email sent successfully to new user", { adminName });
    }

    // PHASE GATE 4: Update Stripe subscription quantity (auto-prorates)
    if (role === 'driver') {
      try {
        logStep("Updating Stripe subscription quantity");
        const authHeaderValue = req.headers.get("Authorization");

        const { data: billingData, error: billingError } = await supabaseClient.functions.invoke(
          'update-subscription-quantity',
          {
            headers: {
              Authorization: authHeaderValue || ''
            }
          }
        );

        if (billingError) {
          logStep("Warning: Failed to update subscription quantity", { error: billingError });
          // Don't fail the whole operation - billing can be corrected manually
        } else {
          logStep("Subscription quantity updated", billingData);
        }
      } catch (billingErr) {
        logStep("Warning: Exception updating billing", { error: billingErr });
        // Don't fail - manual correction possible
      }
    }

    // Success response
    return new Response(JSON.stringify({
      success: true,
      message: isNewUser ? "Team member invited successfully" : "Team member updated and re-invited",
      emailSent: true,
      chargeApplied: role === 'driver', // Only drivers are charged
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
