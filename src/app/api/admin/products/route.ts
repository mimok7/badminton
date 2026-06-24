import { NextResponse } from 'next/server';
import { getProfileByUserId, isAdminRole } from '@/lib/auth';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';

async function requireAdmin() {
  const serverSupabase = await getSupabaseServerClient();
  const adminSupabase = getSupabaseAdminClient() as any;
  const {
    data: { user },
    error: authError,
  } = await serverSupabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const currentProfile = await getProfileByUserId(serverSupabase, user.id);
  if (!currentProfile || !isAdminRole(currentProfile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminSupabase, currentProfile };
}

export async function GET() {
  const context = await requireAdmin();
  if ('error' in context) return context.error;

  const { adminSupabase } = context;

  const [{ data: products, error: productsError }, { data: purchases, error: purchasesError }] = await Promise.all([
    adminSupabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('product_purchases')
      .select(`
        id,
        profile_id,
        product_id,
        coin_price,
        created_at,
        profiles:profile_id(full_name, username),
        products:product_id(name)
      `)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (productsError || purchasesError) {
    return NextResponse.json(
      { error: productsError?.message || purchasesError?.message || '상품 데이터를 불러오지 못했습니다.' },
      { status: 500 }
    );
  }

  // 조인 데이터 가공 (타입 맞춤)
  const formattedPurchases = (purchases || []).map((p: any) => ({
    id: p.id,
    profile_id: p.profile_id,
    product_id: p.product_id,
    coin_price: p.coin_price,
    created_at: p.created_at,
    user_name: p.profiles?.full_name || p.profiles?.username || '회원',
    product_name: p.products?.name || '삭제된 상품',
  }));

  return NextResponse.json({
    products: products || [],
    purchases: formattedPurchases,
  });
}

export async function POST(request: Request) {
  const context = await requireAdmin();
  if ('error' in context) return context.error;

  const { adminSupabase } = context;
  const body = await request.json().catch(() => null);
  const action = String(body?.action || '');

  if (action === 'create') {
    const name = String(body?.name || '').trim();
    const coinPrice = Number(body?.coin_price);
    const description = typeof body?.description === 'string' ? body.description.trim() : null;
    const imageSvg = typeof body?.image_svg === 'string' ? body.image_svg.trim() : null;

    if (!name || !Number.isFinite(coinPrice) || coinPrice < 0) {
      return NextResponse.json({ error: '올바른 상품 정보를 입력해주세요.' }, { status: 400 });
    }

    const { data: product, error } = await adminSupabase
      .from('products')
      .insert({
        name,
        coin_price: coinPrice,
        description,
        image_svg: imageSvg,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ product });
  }

  if (action === 'update') {
    const id = String(body?.id || '');
    const name = String(body?.name || '').trim();
    const coinPrice = Number(body?.coin_price);
    const description = typeof body?.description === 'string' ? body.description.trim() : null;
    const imageSvg = typeof body?.image_svg === 'string' ? body.image_svg.trim() : null;
    const isActive = body?.is_active !== false;

    if (!id || !name || !Number.isFinite(coinPrice) || coinPrice < 0) {
      return NextResponse.json({ error: '올바른 상품 정보를 입력해주세요.' }, { status: 400 });
    }

    const { data: product, error } = await adminSupabase
      .from('products')
      .update({
        name,
        coin_price: coinPrice,
        description,
        image_svg: imageSvg,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ product });
  }

  if (action === 'delete') {
    const id = String(body?.id || '');

    if (!id) {
      return NextResponse.json({ error: '상품 ID가 필요합니다.' }, { status: 400 });
    }

    const { error } = await adminSupabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: '지원하지 않는 액션입니다.' }, { status: 400 });
}
