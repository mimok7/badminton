import React from 'react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h1 className="text-3xl font-bold text-red-600 mb-4">페이지를 찾을 수 없습니다</h1>
      <p className="text-gray-700 mb-6">요청하신 관리자 메뉴 페이지가 존재하지 않거나 준비 중입니다.</p>
      <a href="/admin" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">관리자 메뉴로 돌아가기</a>
    </div>
  );
}
