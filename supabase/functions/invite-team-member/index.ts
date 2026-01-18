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
  can_upload_routes?: boolean;
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

    // Build admin name with fallbacks
    let adminName = 'Your Team Admin';
    let adminEmail = requestingUser.email || '';

    if (adminProfile && !adminProfileError) {
      // Profile exists - use its data with fallbacks
      const profileFirstName = adminProfile.first_name?.trim() || '';
      const profileLastName = adminProfile.last_name?.trim() || '';
      const profileEmail = adminProfile.email?.trim() || '';

      adminName = `${profileFirstName} ${profileLastName}`.trim() || 'Your Team Admin';
      adminEmail = profileEmail || requestingUser.email || '';

      logStep("Admin profile fetched", { adminName, adminEmail, source: 'profile' });
    } else {
      // Profile missing or incomplete - fall back to auth user data
      const userFirstName = requestingUser.user_metadata?.first_name?.trim() || '';
      const userLastName = requestingUser.user_metadata?.last_name?.trim() || '';

      adminName = `${userFirstName} ${userLastName}`.trim() || 'Your Team Admin';

      logStep("Admin profile missing - using auth user data", {
        adminName,
        adminEmail,
        source: 'auth_user',
        profileError: adminProfileError?.message
      });
    }

    // Parse request body FIRST (need account_id for validation)
    const body: InviteRequest = await req.json();
    const {
      email,
      first_name,
      last_name,
      account_id,
      role,
      can_view_all_routes = false,
      can_upload_routes = (role === 'driver' ? true : false)  // Drivers default TRUE (need to pick routes), admins default FALSE (billing/mgmt only)
    } = body;

    // Validate required fields
    if (!email || !first_name || !last_name || !account_id || !role) {
      throw new Error("Missing required fields: email, first_name, last_name, account_id, role");
    }

    // VALIDATION: Email format (prevent "user@" or "user@com")
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      logStep("Invalid email format", { email });
      throw new Error("Invalid email format. Please provide a valid email address (e.g., user@example.com)");
    }

    // VALIDATION: Names cannot be empty strings or whitespace only
    if (!first_name.trim() || !last_name.trim()) {
      logStep("Invalid names - empty or whitespace only", { first_name, last_name });
      throw new Error("First name and last name cannot be empty");
    }

    logStep("Request validated", { email, role, account_id });

    // SECURITY: Verify requesting user is admin OF THIS SPECIFIC ACCOUNT
    // CRITICAL: Must validate account_id ownership to prevent cross-account privilege escalation
    const { data: requestingUserRole, error: roleError } = await supabaseClient
      .from('account_users')
      .select('role, account_id')
      .eq('user_id', requestingUser.id)
      .eq('account_id', account_id)  // ← CRITICAL: Validates admin of THIS account, not just any account
      .single();

    if (roleError || requestingUserRole?.role !== 'primary_admin') {
      // Log unauthorized access attempt for security audit
      logStep("SECURITY: Unauthorized account access attempt blocked", {
        requestingUserId: requestingUser.id,
        requestedAccountId: account_id,
        hasAdminRole: requestingUserRole?.role === 'primary_admin',
        error: roleError?.message || 'User is not admin of requested account'
      });
      throw new Error("Unauthorized: You can only invite members to your own account");
    }
    logStep("Admin permission verified for account", { account_id });

    // PHASE GATE 1: Check seat availability
    const { data: seatCheck, error: seatError } = await supabaseClient
      .rpc('check_seat_availability', {
        p_account_id: account_id,
        p_role: role,
        p_can_upload_routes: can_upload_routes
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
    // Query profiles table by email (handles 1000+ users, avoids pagination issues)
    const { data: existingProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, email')
      .eq('email', email.trim().toLowerCase()) // Case-insensitive lookup
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = not found (OK)
      throw new Error(`Failed to check existing user: ${profileError.message}`);
    }

    let userId: string;
    let isNewUser = false;
    const existingUser = existingProfile;

    if (existingUser) {
      // BRANCH A: Existing user - check if cross-account or same-account
      userId = existingUser.id;

      // Check if user is already in THIS account
      const { data: existingAccountUser } = await supabaseClient
        .from('account_users')
        .select('id, role')
        .eq('account_id', account_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingAccountUser) {
        // Same-account re-invite: Update metadata
        logStep("User exists in THIS account, updating metadata", { userId, accountUserId: existingAccountUser.id });

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

        // Upsert profile
        const { error: profileError } = await supabaseClient
          .from('profiles')
          .upsert({
            id: userId,
            email: email.trim().toLowerCase(), // Normalize email
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
        // Cross-account invite: User exists in DIFFERENT account
        // Verify profile exists, create if missing
        const { data: crossAccountProfile, error: checkError } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw new Error(`Failed to check profile existence: ${checkError.message}`);
        }

        if (!crossAccountProfile) {
          // Profile missing - create it
          logStep("Cross-account user missing profile - creating", { userId });
          const { error: createProfileError } = await supabaseClient
            .from('profiles')
            .insert({
              id: userId,
              email: email.trim().toLowerCase(),
              first_name,
              last_name
            });

          if (createProfileError) {
            throw new Error(`Failed to create profile for cross-account user: ${createProfileError.message}`);
          }
          logStep("Profile created for cross-account user");
        } else {
          logStep("Cross-account invite: Using existing profile", { userId });
        }
      }

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

      // Upsert profile (handles race condition with handle_new_user trigger)
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .upsert({
          id: userId,
          email: email.trim().toLowerCase(), // Normalize email for case-insensitive lookups
          first_name,
          last_name
        }, {
          onConflict: 'id',
          ignoreDuplicates: false  // Update if trigger already created it
        });

      if (profileError) {
        throw new Error(`Failed to upsert profile: ${profileError.message}`);
      }
      logStep("Profile upserted");
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

      // SECURITY: Prevent last admin from being demoted (account lockout protection)
      // Bug #4.2 Fix - Layer 1: Application-level validation
      if (existingAccountUser.role === 'primary_admin' && role !== 'primary_admin') {
        // Admin is being demoted - check if this is the last admin
        const { data: adminCount, error: countError } = await supabaseClient
          .from('account_users')
          .select('id')
          .eq('account_id', account_id)
          .eq('role', 'primary_admin');

        if (countError) {
          logStep("Warning: Failed to count admins", { error: countError.message });
        }

        if (adminCount && adminCount.length === 1) {
          // This is the last admin
          logStep("SECURITY: Last admin demotion prevented", {
            account_id,
            userId,
            adminCount: adminCount.length
          });

          throw new Error(
            "Cannot change role: You are the last admin for this account. " +
            "Promote another user to admin before changing your own role."
          );
        }

        logStep("Admin demotion allowed", {
          remainingAdmins: adminCount ? adminCount.length - 1 : 0
        });
      }

      const { error: updateRoleError } = await supabaseClient
        .from('account_users')
        .update({
          role,
          can_view_all_routes,
          can_upload_routes
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
          can_view_all_routes,
          can_upload_routes
        });

      if (accountUserError) {
        // Check if error is UNIQUE constraint violation (user already in account)
        if (accountUserError.message && (accountUserError.message.includes('duplicate key') || accountUserError.message.includes('unique constraint'))) {
          logStep("UNIQUE constraint violated - user already in account", {
            account_id,
            userId,
            isNewUser,
            error: accountUserError.message
          });

          // Clean up orphaned records if this was a new user creation
          if (isNewUser) {
            logStep("Cleaning up orphaned auth.users and profile records", { userId });
            try {
              await supabaseClient.auth.admin.deleteUser(userId);
              await supabaseClient.from('profiles').delete().eq('id', userId);
              logStep("Orphaned records cleaned up successfully");
            } catch (cleanupError) {
              logStep("Warning: Failed to clean up orphaned records", { error: cleanupError });
              // Continue - admin can clean up manually
            }
          }

          return new Response(JSON.stringify({
            success: false,
            error: "This user is already a member of this account.",
            duplicate_user: true
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }

        // Check if error is seat limit constraint violation (Layer 2 defense triggered)
        if (accountUserError.message && accountUserError.message.includes('check_driver_seat_limit')) {
          logStep("CRITICAL: Seat limit constraint violated - race condition detected and prevented", {
            account_id,
            role,
            userId,
            error: accountUserError.message,
            layer_triggered: "Layer 2 (CHECK constraint)"
          });

          return new Response(JSON.stringify({
            success: false,
            error: "Driver seat limit reached. Please upgrade your plan to add more drivers.",
            seat_limit_exceeded: true,
            race_condition_detected: true,
            layer_triggered: "database_constraint"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
          });
        }

        // Other database errors
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
    // Billable users: drivers + operational admins (admins who can upload routes)
    const isBillableUser = (role === 'driver') || (role === 'primary_admin' && can_upload_routes === true);
    let billingSyncFailed = false;
    let billingSyncError = '';

    if (isBillableUser) {
      try {
        logStep("Updating Stripe subscription quantity", { role, can_upload_routes, isBillableUser });
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
          billingSyncFailed = true;
          billingSyncError = billingError.message || String(billingError);
          logStep("CRITICAL: Failed to update subscription quantity - manual correction required", {
            error: billingError,
            userId,
            account_id,
            role,
            can_upload_routes
          });
          // Don't fail the whole operation - billing can be corrected manually
        } else {
          logStep("Subscription quantity updated", billingData);
        }
      } catch (billingErr) {
        billingSyncFailed = true;
        billingSyncError = billingErr instanceof Error ? billingErr.message : String(billingErr);
        logStep("CRITICAL: Exception updating billing - manual correction required", {
          error: billingErr,
          userId,
          account_id,
          role,
          can_upload_routes
        });
        // Don't fail - manual correction possible
      }
    } else {
      logStep("Non-billable user - skipping Stripe update", { role, can_upload_routes });
    }

    // Success response
    const response: any = {
      success: true,
      message: isNewUser ? "Team member invited successfully" : "Team member updated and re-invited",
      emailSent: true,
      chargeApplied: isBillableUser, // Drivers + operational admins are charged
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
        used_seats: seatAvailability.used_seats + (isNewUser && isBillableUser ? 1 : 0),
        available_seats: seatAvailability.available_seats - (isNewUser && isBillableUser ? 1 : 0)
      }
    };

    // Add billing sync status if it failed
    if (billingSyncFailed) {
      response.billing_sync_failed = true;
      response.billing_sync_error = billingSyncError;
      response.warning = `User added successfully but billing sync failed: ${billingSyncError}. Please contact support or manually adjust Stripe subscription.`;
    }

    return new Response(JSON.stringify(response), {
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
