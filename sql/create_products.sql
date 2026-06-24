-- 상품 정보 테이블 생성
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    coin_price INTEGER NOT NULL CHECK (coin_price >= 0),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 상품 구매/차감 기록 테이블 생성
CREATE TABLE IF NOT EXISTS public.product_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    coin_price INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본 상품 3종 자동 등록 (그립, 양말, 셔틀콕)
INSERT INTO public.products (name, coin_price, description)
VALUES 
    ('그립', 5, '배드민턴 라켓용 오버그립'),
    ('양말', 10, '스포츠용 두꺼운 배드민턴 양말'),
    ('셔틀콕', 15, '경기용 고급 셔틀콕 1개')
ON CONFLICT DO NOTHING;

-- RLS 활성화 및 접근 권한 설정
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_purchases ENABLE ROW LEVEL SECURITY;

-- 상품 조회는 누구나 가능
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
CREATE POLICY "Anyone can view active products" ON public.products
    FOR SELECT USING (true);

-- 상품 생성/수정/삭제는 관리자만 가능
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.role = 'admin'
        )
    );

-- 본인의 상품 구매 이력은 본인만 조회 가능
DROP POLICY IF EXISTS "Users can view own purchases" ON public.product_purchases;
CREATE POLICY "Users can view own purchases" ON public.product_purchases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = product_purchases.profile_id
              AND (p.user_id = auth.uid() OR p.id = auth.uid())
        )
    );

-- 관리자는 모든 구매 이력 조회 가능
DROP POLICY IF EXISTS "Admins can view all purchases" ON public.product_purchases;
CREATE POLICY "Admins can view all purchases" ON public.product_purchases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.role = 'admin'
        )
    );

-- 구매 기록 생성은 본인 또는 관리자만 가능
DROP POLICY IF EXISTS "Users can record purchases" ON public.product_purchases;
CREATE POLICY "Users can record purchases" ON public.product_purchases
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = product_purchases.profile_id
              AND (p.user_id = auth.uid() OR p.id = auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.role = 'admin'
        )
    );
