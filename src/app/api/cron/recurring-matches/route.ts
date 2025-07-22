import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // 요청 헤더에서 인증 토큰 확인 (보안을 위해)
    const authHeader = request.headers.get('authorization');
    const secretToken = process.env.CRON_SECRET_TOKEN;

    if (!secretToken || authHeader !== `Bearer ${secretToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 정기모임 자동 생성 실행
    const { data, error } = await supabase.rpc('daily_match_generation');

    if (error) {
      console.error('정기모임 생성 오류:', error);
      return NextResponse.json(
        { error: '정기모임 생성 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      );
    }

    console.log('정기모임 자동 생성 완료:', data);

    return NextResponse.json({
      success: true,
      result: data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('API 실행 중 오류:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST 메서드도 지원 (수동 실행용)
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 관리자 권한 확인
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // 정기모임 자동 생성 실행
    const { data, error } = await supabase.rpc('daily_match_generation');

    if (error) {
      console.error('정기모임 생성 오류:', error);
      return NextResponse.json(
        { error: '정기모임 생성 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: data,
      timestamp: new Date().toISOString(),
      executed_by: user.id
    });

  } catch (error) {
    console.error('API 실행 중 오류:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
