CREATE TABLE public.club_level_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    level_code TEXT NOT NULL,
    alias TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(club_id, level_code)
);

ALTER TABLE public.club_level_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
    ON public.club_level_aliases FOR SELECT
    USING (true);

CREATE POLICY "Enable insert/update/delete for club managers"
    ON public.club_level_aliases FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.club_members
            WHERE club_members.club_id = club_level_aliases.club_id
              AND club_members.user_id = auth.uid()
              AND club_members.role IN ('owner', 'admin', 'manager')
        )
    );
