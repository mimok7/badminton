'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AvatarCropModalProps {
  imageFile: File;
  isOpen: boolean;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob) => void;
}

export function AvatarCropModal({
  imageFile,
  isOpen,
  onClose,
  onCropComplete,
}: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 1. 파일로부터 HTML Image 로드 (마운트 시 1회 실행하여 언마운트 시점에만 안전 해제)
  useEffect(() => {
    const imageUrl = URL.createObjectURL(imageFile);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    };
    image.src = imageUrl;

    return () => {
      URL.revokeObjectURL(imageUrl);
    };
  }, []);

  // 2. 이미지 줌, 드래그 상태에 따라 캔버스 그리기
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 최종 크롭 규격 고정 (300x300)
    canvas.width = 300;
    canvas.height = 300;

    ctx.clearRect(0, 0, 300, 300);

    const canvasWidth = 300;
    const canvasHeight = 300;

    // 가로/세로 비율 유지하여 캔버스에 꽉 차도록 그리기 위한 사이즈 계산
    const imgRatio = img.width / img.height;
    let drawWidth = canvasWidth;
    let drawHeight = canvasHeight;

    if (imgRatio > 1) {
      // 가로가 더 긴 경우 -> 세로를 채우고 가로를 늘림
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgRatio;
    } else {
      // 세로가 더 긴 경우 -> 가로를 채우고 세로를 늘림
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgRatio;
    }

    ctx.save();
    // 중심축을 캔버스의 중앙으로 이동 후 드래그 오프셋 적용
    ctx.translate(canvasWidth / 2 + offset.x, canvasHeight / 2 + offset.y);
    // 확대/축소 비율 적용
    ctx.scale(scale, scale);
    // 중심축 기준 대칭 배치 드로잉
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }, [img, offset, scale]);

  // 마우스 드래그 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 모바일 터치 드래그 핸들러
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const touch = e.touches[0];
      setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1) {
      const touch = e.touches[0];
      setOffset({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleCrop = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(
      (blob) => {
        if (blob) {
          onCropComplete(blob);
        }
      },
      'image/jpeg',
      0.85 // 고화질 압축
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-base font-bold text-slate-800">프로필 사진 조절</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 바디 - 크롭 뷰포트 영역 (200px로 축소) */}
        <div className="my-4 flex flex-col items-center">
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative size-[200px] overflow-hidden rounded-[32px] bg-slate-50 shadow-inner cursor-move select-none border border-slate-100 touch-none"
          >
            {/* 가상 캔버스 */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 size-full object-cover"
            />
            {/* 둥근 테두리 타원형 마스크 가이드라인 */}
            <div className="absolute inset-0 pointer-events-none border-[16px] border-black/35 rounded-[32px]" />
            {/* 얇은 화이트 포커스 라인 */}
            <div className="absolute inset-[16px] pointer-events-none border-2 border-white/60 rounded-[20px]" />
          </div>
          
          <p className="mt-2 text-[11px] text-slate-400 text-center">
            마우스 드래그나 화면 터치로 사진을 조절해 보세요
          </p>
        </div>

        {/* 푸터 - 스케일 컨트롤러 & 확인 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 bg-slate-50 px-3 py-2 rounded-2xl">
            <ZoomOut className="size-3.5 text-slate-400 shrink-0" />
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0f172a]"
            />
            <ZoomIn className="size-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-500 w-8 text-right shrink-0">
              {Math.round(scale * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-10 w-full rounded-xl text-xs text-slate-600 border-slate-200 hover:bg-slate-50 font-semibold"
            >
              취소
            </Button>
            <Button
              onClick={handleCrop}
              className="h-10 w-full rounded-xl text-xs bg-[#0f172a] text-white hover:bg-slate-800 font-semibold"
            >
              적용하기
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
