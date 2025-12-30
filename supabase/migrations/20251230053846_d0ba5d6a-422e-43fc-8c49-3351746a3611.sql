-- Create monthly_usage table for tracking usage metrics
CREATE TABLE public.monthly_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    declared_drivers INTEGER NOT NULL,
    total_machines_completed INTEGER DEFAULT 0,
    working_days INTEGER DEFAULT 0,
    peak_daily_machines INTEGER DEFAULT 0,
    calculated_drivers_needed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(account_id, month)
);

-- Enable RLS
ALTER TABLE public.monthly_usage ENABLE ROW LEVEL SECURITY;

-- Users can view usage for their own account
CREATE POLICY "Users view own account usage" ON public.monthly_usage
FOR SELECT USING (account_id IN (
    SELECT account_id FROM public.account_users WHERE user_id = auth.uid()
));

-- Add min_drivers_required column to accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS min_drivers_required INTEGER DEFAULT 2;

-- Create trigger for updated_at
CREATE TRIGGER update_monthly_usage_updated_at
    BEFORE UPDATE ON public.monthly_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();