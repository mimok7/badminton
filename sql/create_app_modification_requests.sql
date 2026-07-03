-- Create app_modification_requests table
CREATE TABLE public.app_modification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_modification_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own requests
CREATE POLICY "Users can view their own app modification requests" ON public.app_modification_requests
    FOR SELECT USING (auth.uid() = requester_id OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager')
    ));

-- Policy: Users can insert their own requests
CREATE POLICY "Users can insert their own app modification requests" ON public.app_modification_requests
    FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Policy: Admins can update requests (e.g. status, completed_at)
CREATE POLICY "Admins can update app modification requests" ON public.app_modification_requests
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager')
    ));
