#!/usr/bin/env python3
"""
XF Discovery: Teams Feature Pre-emptive Bug Analysis
Analyzes invite flow, permissions, data integrity, and edge cases
"""
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
StockerAI Teams Feature - Multi-tenant team management with invites

SYSTEM OVERVIEW:
- Frontend: Team.tsx (React/TypeScript) - UI for inviting, editing, deleting team members
- Backend: invite-team-member Edge Function (Deno) - Handles user creation/invite
- Database: account_users, accounts, profiles, route_assignments tables
- Auth: Supabase Auth Admin API for user management
- Email: Invite email flow with password setup

KEY FLOWS:
1. INVITE FLOW:
   - Admin clicks "Add Team Member"
   - Enters: email, first_name, last_name, role (driver/primary_admin), can_view_all_routes
   - Frontend calls Edge Function: supabase.functions.invoke('invite-team-member', ...)
   - Edge Function:
     a) Authenticates requesting user
     b) Verifies requester is primary_admin
     c) Checks seat availability via check_seat_availability() RPC
     d) Checks if email already exists in auth.users
     e) If exists: Update user_metadata + upsert profile
     f) If new: createUser() + insert profile
     g) Check if user in account_users for this account_id
     h) If exists: Update role + can_view_all_routes
     i) If new: Insert into account_users
     j) Send invite email via inviteUserByEmail()
   - Returns success + user data

2. EDIT FLOW:
   - Admin clicks edit on team member
   - Updates role and/or can_view_all_routes
   - Direct Supabase UPDATE on account_users table
   - Prevents changing role if only admin

3. DELETE FLOW:
   - Admin clicks delete
   - Validates can't delete self or last admin
   - Direct Supabase DELETE on account_users table
   - Cascades handled by ON DELETE CASCADE

DATA MODEL:
- accounts: Multi-tenant accounts (id, name, driver_count, subscription_status)
- account_users: User-to-account mapping (id, account_id, user_id, role, can_view_all_routes)
- profiles: User profile data (id, email, first_name, last_name)
- auth.users: Supabase auth table
- route_assignments: Route-to-user assignments (route_id, user_id, assigned_by)

CONSTRAINTS:
- UNIQUE(account_id, user_id) on account_users
- ON DELETE CASCADE on account_users -> accounts, auth.users
- role enum: 'primary_admin' | 'driver'
- Seat limits enforced by check_seat_availability() RPC

ANALYZE FOR POTENTIAL BUGS:
- Race conditions (concurrent invites, role changes)
- Data consistency (orphaned records, cascade failures)
- Auth/permission bypass scenarios
- Email delivery failures leaving user in bad state
- Edge cases (invalid emails, duplicate invites)
- State mismatches between auth.users, profiles, account_users
- Frontend validation vs backend validation gaps
- Error recovery (partial failures in multi-step Edge Function)
- Seat limit race conditions
- Route access control bugs (can_view_all_routes)
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

# Print results
print("=" * 80)
print("XF TEAMS FEATURE DISCOVERY COMPLETE")
print("=" * 80)
print()
for boundary_name, boundary in result.boundaries.items():
    print(f"### {boundary_name}")
    print(f"Question: {boundary.question}")
    print(f"Elements: {len(boundary.elements)}")
    for elem in boundary.elements:
        print(f"  - {elem.name}: {elem.description}")
    print()

print(f"Iterations: {result.metadata.total_iterations}")
print(f"MECE Validation: {result.validation.passed}")
print(f"Discovery ID: {result.metadata.discovery_id}")
print()
print("=" * 80)
print("NEXT STEPS:")
print("1. Review discovered failure modes")
print("2. Prioritize by severity (data loss, security, UX)")
print("3. Write test cases for high-priority scenarios")
print("4. Implement fixes with proper boundary validation")
print("=" * 80)
