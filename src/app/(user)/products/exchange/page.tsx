'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { Coins, Gift, RefreshCw, AlertCircle, ShoppingBag, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

type Product = {
  id: string;
  name: string;
  coin_price: number;
  description: string | null;
  image_svg: string | null;
  is_active: boolean;
};

type ProductPurchase = {
  id: string;
  profile_id: string;
  product_id: string;
  coin_price: number;
  created_at: string;
  product_name: string;
};

export default function UserProductsExchangePage() {
  const { user, profile, loading: userLoading, refreshProfile } = useUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<ProductPurchase[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [dbMissing, setDbMissing] = useState(false);
  const [exchangingId, setExchangingId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setDbMissing(false);

      // 1. 활성 상품 목록 패치
      const response = await fetch('/api/products');
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const errMsg = payload?.error || '';
        if (errMsg.includes('relation') && errMsg.includes('does not exist')) {
          setDbMissing(true);
        }
        throw new Error(errMsg || '상품 목록 조회 실패');
      }

      setProducts(payload?.products || []);

      // 2. 본인 구매 이력 패치
      const purchasesResponse = await fetch('/api/products/purchases');
      const purchasesPayload = await purchasesResponse.json().catch(() => null);

      if (purchasesResponse.ok) {
        setPurchases(purchasesPayload?.purchases || []);
      }
    } catch (error) {
      console.error('상품 교환 데이터 패치 에러:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExchange = async (product: Product) => {
    const coinBalance = profile?.coin_balance ?? 0;
    if (coinBalance < product.coin_price) {
      alert(`보유 코인이 부족합니다.\n필요 코인: ${product.coin_price}코인\n보유 코인: ${coinBalance}코인`);
      return;
    }

    if (!confirm(`🎁 "${product.name}" 상품을 교환하시겠습니까?\n[${product.coin_price} 코인이 차감됩니다]`)) {
      return;
    }

    try {
      setExchangingId(product.id);
      const response = await fetch('/api/products/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || '상품 교환 처리 실패');
      }

      alert(`🎉 "${product.name}" 교환이 완료되었습니다!\n현장에서 관리자에게 확인해 주세요.`);
      
      // 프로필 잔액 갱신 및 데이터 리로드
      await refreshProfile();
      await fetchData();
    } catch (error) {
      console.error('상품 교환 처리 에러:', error);
      alert(error instanceof Error ? error.message : '교환 처리 중 오류가 발생했습니다.');
    } finally {
      setExchangingId(null);
    }
  };

  const isPageLoading = userLoading || (loading && products.length === 0 && !dbMissing);

  if (isPageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="flex items-center">
          <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
          <span className="ml-2 text-slate-700 font-semibold text-sm">상품 정보를 불러오는 중입니다...</span>
        </div>
      </div>
    );
  }

  const userCoins = profile?.coin_balance ?? 0;

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 pb-12">
      {/* 1. 상단 그라디언트 비주얼 헤더 */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 px-4 py-8 text-white shadow-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(99,102,241,0.15),transparent_50%)]" />
        <div className="mx-auto max-w-3xl flex flex-col gap-6 relative z-10">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300">
                <Sparkles className="h-3 w-3" />
                뚱보 코인 마켓
              </span>
              <h1 className="text-2xl font-bold tracking-tight">상품 교환</h1>
            </div>
            <Link href="/dashboard" className="text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 transition">
              대시보드 이동
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* 코인 잔액 디스플레이 카드 (Glassmorphism) */}
          <div className="flex items-center justify-between rounded-2xl bg-white/10 border border-white/10 p-5 backdrop-blur-sm">
            <div className="space-y-1">
              <span className="text-xs text-indigo-200 font-medium">나의 현재 보유 잔액</span>
              <div className="flex items-center gap-1.5">
                <Coins className="h-6 w-6 text-amber-400" />
                <span className="text-2xl font-black text-amber-300">{userCoins}</span>
                <span className="text-sm font-semibold text-slate-200">코인</span>
              </div>
            </div>
            <div className="rounded-full bg-white/5 p-3">
              <Gift className="h-7 w-7 text-indigo-300" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-8">
        {/* 2. DB 미생성 예외 배너 */}
        {dbMissing && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-amber-900">교환 시스템 준비 중</h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                현재 관리자가 데이터베이스 테이블 생성을 진행하고 있습니다. 잠시 후 새로고침해 주세요.
              </p>
            </div>
          </div>
        )}

        {/* 3. 상품 목록 영역 */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-indigo-600" />
            교환 가능한 상품 목록
          </h2>

          {!dbMissing && products.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200/50">
              현재 준비된 교환 상품이 없습니다.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {products.map((product) => {
                const canAfford = userCoins >= product.coin_price;
                const isExchanging = exchangingId === product.id;

                return (
                  <div 
                    key={product.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md hover:scale-[1.01] duration-200"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {product.image_svg ? (
                            <div className="h-10 w-10 shrink-0 text-indigo-600 bg-indigo-50/50 rounded-xl p-2 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: product.image_svg }} />
                          ) : (
                            <div className="h-10 w-10 shrink-0 text-slate-400 bg-slate-50 rounded-xl p-2 flex items-center justify-center">
                              <Gift className="h-5 w-5" />
                            </div>
                          )}
                          <h3 className="font-bold text-slate-900 text-base">{product.name}</h3>
                        </div>
                        <div className="flex items-center gap-0.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                          <Coins className="h-3.5 w-3.5 text-amber-500" />
                          {product.coin_price}코인
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed min-h-[2.5rem]">
                        {product.description || '상품 정보가 아직 등록되지 않았습니다.'}
                      </p>
                    </div>

                    <div className="mt-4 pt-2">
                      <Button
                        type="button"
                        onClick={() => handleExchange(product)}
                        disabled={isExchanging || !canAfford}
                        className={`w-full h-9 font-semibold text-xs rounded-xl transition ${
                          canAfford 
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                            : 'bg-slate-100 hover:bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {isExchanging ? '교환 진행 중...' : canAfford ? '상품 교환 신청' : '코인 부족'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. 본인 최근 교환 이력 */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">나의 최근 교환 내역</h2>
          {purchases.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-xs text-slate-400 shadow-sm border border-slate-200/50">
              최근에 교환하신 상품 내역이 없습니다.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/50 bg-white p-4 shadow-sm divide-y divide-slate-100">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="flex items-center justify-between py-3 first:pt-1 last:pb-1">
                  <div>
                    <span className="font-bold text-slate-800 text-sm">{purchase.product_name}</span>
                    <p className="mt-1 text-[10px] text-slate-400">
                      교환일: {new Date(purchase.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-rose-600 text-sm">-{purchase.coin_price} 코인</span>
                    <p className="mt-0.5 text-[9px] text-emerald-600 font-semibold">교환 완료</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
