-- Create the match_wager_proposals table
CREATE TABLE IF NOT EXISTS public.match_wager_proposals (
    match_id BIGINT PRIMARY KEY REFERENCES public.generated_matches(id) ON DELETE CASCADE,
    proposed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    wager_amount INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    responses JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.match_wager_proposals ENABLE ROW LEVEL SECURITY;

-- Create policies for access control
CREATE POLICY "Enable read access for all users" ON public.match_wager_proposals
    FOR SELECT USING (true);

CREATE POLICY "Enable all operations for service role" ON public.match_wager_proposals
    FOR ALL USING (true) WITH CHECK (true);

-- Create a trigger function to auto-update the updated_at column
CREATE OR REPLACE FUNCTION public.update_match_wager_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_match_wager_proposals_updated_at ON public.match_wager_proposals;
CREATE TRIGGER trg_match_wager_proposals_updated_at
    BEFORE UPDATE ON public.match_wager_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_match_wager_proposals_updated_at();

-- Comment on table and columns
COMMENT ON TABLE public.match_wager_proposals IS 'Tracks proposed coin wagers for a match, requiring approval from all participants.';
COMMENT ON COLUMN public.match_wager_proposals.match_id IS 'References generated_matches.id (Primary Key)';
COMMENT ON COLUMN public.match_wager_proposals.proposed_by IS 'The profile_id of the user who proposed the wager change.';
COMMENT ON COLUMN public.match_wager_proposals.wager_amount IS 'The newly proposed wager amount (e.g., 2 or 3).';
COMMENT ON COLUMN public.match_wager_proposals.status IS 'Current status: pending, accepted, or rejected.';
COMMENT ON COLUMN public.match_wager_proposals.responses IS 'JSON object storing responses. Format: {"profile_id": "accept|reject"}';
