-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('primary_admin', 'driver');

-- Create accounts table for multi-tenant structure
CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
    trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '14 days'),
    driver_count INTEGER DEFAULT 2,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create account_users table for role-based access
CREATE TABLE public.account_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'driver',
    can_view_all_routes BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(account_id, user_id)
);

-- Create route_assignments table
CREATE TABLE public.route_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(route_id, user_id)
);

-- Create discount_codes table
CREATE TABLE public.discount_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value NUMERIC NOT NULL,
    duration_months INTEGER,
    max_uses INTEGER,
    times_used INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.account_users
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Function to get user's account_id
CREATE OR REPLACE FUNCTION public.get_user_account_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT account_id
    FROM public.account_users
    WHERE user_id = _user_id
    LIMIT 1
$$;

-- Function to check if user can view all routes
CREATE OR REPLACE FUNCTION public.can_view_all_routes(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT can_view_all_routes OR role = 'primary_admin'
         FROM public.account_users
         WHERE user_id = _user_id
         LIMIT 1),
        false
    )
$$;

-- RLS Policies for accounts
CREATE POLICY "Users can view their own account"
ON public.accounts
FOR SELECT
USING (id IN (SELECT account_id FROM public.account_users WHERE user_id = auth.uid()));

CREATE POLICY "Primary admins can update their account"
ON public.accounts
FOR UPDATE
USING (
    id IN (SELECT account_id FROM public.account_users WHERE user_id = auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
);

-- RLS Policies for account_users
CREATE POLICY "Users can view members of their account"
ON public.account_users
FOR SELECT
USING (account_id = public.get_user_account_id(auth.uid()));

CREATE POLICY "Primary admins can insert account users"
ON public.account_users
FOR INSERT
WITH CHECK (
    account_id = public.get_user_account_id(auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
);

CREATE POLICY "Primary admins can update account users"
ON public.account_users
FOR UPDATE
USING (
    account_id = public.get_user_account_id(auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
);

CREATE POLICY "Primary admins can delete account users"
ON public.account_users
FOR DELETE
USING (
    account_id = public.get_user_account_id(auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
    AND user_id != auth.uid()
);

-- RLS Policies for route_assignments
CREATE POLICY "Users can view their own route assignments"
ON public.route_assignments
FOR SELECT
USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'primary_admin')
);

CREATE POLICY "Primary admins can insert route assignments"
ON public.route_assignments
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'primary_admin'));

CREATE POLICY "Primary admins can update route assignments"
ON public.route_assignments
FOR UPDATE
USING (public.has_role(auth.uid(), 'primary_admin'));

CREATE POLICY "Primary admins can delete route assignments"
ON public.route_assignments
FOR DELETE
USING (public.has_role(auth.uid(), 'primary_admin'));

-- RLS Policies for discount_codes (admin only via service role, public can validate)
CREATE POLICY "Anyone can view active discount codes"
ON public.discount_codes
FOR SELECT
USING (
    (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR times_used < max_uses)
);