import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProfileByUserId, isAdminRole } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: '환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  // 1. 관리자 권한 체크
  const serverSupabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
  }

  const currentProfile = await getProfileByUserId(serverSupabase, user.id);
  if (!currentProfile || !isAdminRole(currentProfile.role)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  // service_role 권한으로 Supabase 어드민 클라이언트 생성
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    // 파일 크기 검증 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 5MB를 초과할 수 없습니다.' }, { status: 400 });
    }

    // notices 버킷이 없으면 자동 생성 시도
    const { data: buckets } = await adminClient.storage.listBuckets();
    const noticesBucket = buckets?.find((b) => b.name === 'notices');
    if (!noticesBucket) {
      const { error: bucketError } = await adminClient.storage.createBucket('notices', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
      });
      if (bucketError) {
        console.error('Failed to create notices bucket:', bucketError);
        return NextResponse.json({ error: `버킷 생성 실패: ${bucketError.message}` }, { status: 500 });
      }
    }

    // 고유 파일명 생성
    const originalName = file.name;
    const extension = originalName.split('.').pop() || '';
    const safeBaseName = originalName
      .substring(0, originalName.lastIndexOf('.'))
      .replace(/[^a-zA-Z0-9가-힣-_]/g, '');
    const fileName = `${Date.now()}_${safeBaseName}.${extension}`;

    // 파일을 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 업로드
    const { error: uploadError } = await adminClient.storage
      .from('notices')
      .upload(fileName, buffer, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('File upload error:', uploadError);
      return NextResponse.json({ error: `업로드 실패: ${uploadError.message}` }, { status: 500 });
    }

    // Public URL 획득
    const { data: { publicUrl } } = adminClient.storage
      .from('notices')
      .getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      publicUrl,
      fileName: originalName,
    });

  } catch (err: any) {
    console.error('File upload server error:', err);
    return NextResponse.json({ error: err.message || '알 수 없는 오류가 발생했습니다.' }, { status: 500 });
  }
}
