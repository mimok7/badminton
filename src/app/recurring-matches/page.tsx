'use client';

import { useState, useEffect } from 'react';
import { RequireAdmin } from '@/components/AuthGuard';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useUser } from '@/hooks/useUser';
import { Button } from '@/components/ui/button';

interface RecurringTemplate {
  id: string;
  name: string;
  description: string | null;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  location: string;
  max_participants: number;
  is_active: boolean;
  advance_days: number;
  created_at: string;
}

const DAYS_OPTIONS = [
  { value: 0, label: '일요일' },
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
];

export default function RecurringMatchPage() {
  const { user } = useUser();
  const supabase = createClientComponentClient();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const [generationResult, setGenerationResult] = useState<any>(null);

  // 새 템플릿 폼 데이터
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    day_of_week: 6,
    start_time: '14:00',
    end_time: '17:00',
    location: '',
    max_participants: 20,
    advance_days: 7
  });

  // 템플릿 목록 조회
  const fetchTemplates = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('recurring_templates_view')
        .select('*')
        .order('day_of_week')
        .order('start_time');

      if (error) {
        console.error('정기모임 템플릿 조회 오류:', error);
        return;
      }

      setTemplates(data || []);
    } catch (error) {
      console.error('정기모임 템플릿 조회 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // 새 템플릿 생성
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    try {
      const { error } = await supabase
        .from('recurring_match_templates')
        .insert({
          ...newTemplate,
          created_by: user.id
        });

      if (error) {
        console.error('템플릿 생성 오류:', error);
        alert('템플릿 생성 중 오류가 발생했습니다.');
        return;
      }

      // 폼 초기화
      setNewTemplate({
        name: '',
        description: '',
        day_of_week: 6,
        start_time: '14:00',
        end_time: '17:00',
        location: '',
        max_participants: 20,
        advance_days: 7
      });
      setShowCreateForm(false);

      // 목록 새로고침
      await fetchTemplates();
      alert('새 정기모임 템플릿이 생성되었습니다!');

    } catch (error) {
      console.error('템플릿 생성 중 오류:', error);
      alert('템플릿 생성 중 오류가 발생했습니다.');
    }
  };

  // 템플릿 수정
  const handleUpdateTemplate = async (template: RecurringTemplate) => {
    try {
      const { error } = await supabase
        .from('recurring_match_templates')
        .update({
          name: template.name,
          description: template.description,
          day_of_week: template.day_of_week,
          start_time: template.start_time,
          end_time: template.end_time,
          location: template.location,
          max_participants: template.max_participants,
          advance_days: template.advance_days,
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (error) {
        console.error('템플릿 수정 오류:', error);
        alert('템플릿 수정 중 오류가 발생했습니다.');
        return;
      }

      setEditingTemplate(null);
      await fetchTemplates();
      alert('템플릿이 수정되었습니다!');

    } catch (error) {
      console.error('템플릿 수정 중 오류:', error);
      alert('템플릿 수정 중 오류가 발생했습니다.');
    }
  };

  // 템플릿 활성화/비활성화
  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('recurring_match_templates')
        .update({ is_active: !currentActive })
        .eq('id', id);

      if (error) {
        console.error('템플릿 활성화 변경 오류:', error);
        alert('템플릿 활성화 변경 중 오류가 발생했습니다.');
        return;
      }

      await fetchTemplates();
      alert(`템플릿이 ${!currentActive ? '활성화' : '비활성화'}되었습니다.`);

    } catch (error) {
      console.error('템플릿 활성화 변경 중 오류:', error);
    }
  };

  // 템플릿 삭제
  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`'${name}' 템플릿을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('recurring_match_templates')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('템플릿 삭제 오류:', error);
        alert('템플릿 삭제 중 오류가 발생했습니다.');
        return;
      }

      await fetchTemplates();
      alert('템플릿이 삭제되었습니다.');

    } catch (error) {
      console.error('템플릿 삭제 중 오류:', error);
    }
  };

  // 수동으로 정기모임 생성 실행
  const handleGenerateMatches = async () => {
    try {
      const { data, error } = await supabase.rpc('daily_match_generation');

      if (error) {
        console.error('정기모임 생성 오류:', error);
        alert('정기모임 생성 중 오류가 발생했습니다.');
        return;
      }

      setGenerationResult(data);
      alert(`성공! ${data.created_matches}개의 새로운 정기모임이 생성되었습니다.`);

    } catch (error) {
      console.error('정기모임 생성 중 오류:', error);
      alert('정기모임 생성 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-lg">정기모임 템플릿을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <RequireAdmin>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">정기모임 자동 생성 관리</h1>
          <p className="text-gray-600 mb-6">
            정기적으로 반복되는 배드민턴 모임을 자동으로 생성하도록 설정할 수 있습니다.
          </p>
          
          <div className="flex gap-4 mb-6">
            <Button 
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-500 hover:bg-blue-600"
            >
              새 정기모임 템플릿 추가
            </Button>
            
            <Button 
              onClick={handleGenerateMatches}
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50"
            >
              지금 정기모임 생성 실행
            </Button>
          </div>

          {generationResult && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">생성 결과</h3>
              <p className="text-green-700">{generationResult.message}</p>
              <p className="text-sm text-green-600 mt-1">
                실행 시간: {new Date(generationResult.execution_time).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* 새 템플릿 생성 폼 */}
        {showCreateForm && (
          <div className="mb-8 p-6 border border-gray-300 rounded-lg bg-gray-50">
            <h2 className="text-xl font-semibold mb-4">새 정기모임 템플릿 생성</h2>
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">모임 이름</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">요일</label>
                  <select
                    value={newTemplate.day_of_week}
                    onChange={(e) => setNewTemplate({...newTemplate, day_of_week: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded"
                  >
                    {DAYS_OPTIONS.map(day => (
                      <option key={day.value} value={day.value}>{day.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">시작 시간</label>
                  <input
                    type="time"
                    value={newTemplate.start_time}
                    onChange={(e) => setNewTemplate({...newTemplate, start_time: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">종료 시간</label>
                  <input
                    type="time"
                    value={newTemplate.end_time}
                    onChange={(e) => setNewTemplate({...newTemplate, end_time: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">장소</label>
                  <input
                    type="text"
                    value={newTemplate.location}
                    onChange={(e) => setNewTemplate({...newTemplate, location: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">최대 참가자</label>
                  <input
                    type="number"
                    value={newTemplate.max_participants}
                    onChange={(e) => setNewTemplate({...newTemplate, max_participants: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded"
                    min="4"
                    max="50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">미리 생성할 일수</label>
                  <input
                    type="number"
                    value={newTemplate.advance_days}
                    onChange={(e) => setNewTemplate({...newTemplate, advance_days: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded"
                    min="1"
                    max="30"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">몇 일 전에 미리 일정을 생성할지 설정</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">설명</label>
                <textarea
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded"
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="bg-green-500 hover:bg-green-600">
                  템플릿 생성
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowCreateForm(false)}
                >
                  취소
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* 템플릿 목록 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">정기모임 템플릿 목록</h2>
          </div>

          {templates.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              등록된 정기모임 템플릿이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      모임명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      요일
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      시간
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      장소
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      최대 참가자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {template.name}
                          </div>
                          {template.description && (
                            <div className="text-sm text-gray-500">
                              {template.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {template.day_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {template.start_time} - {template.end_time}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {template.location}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {template.max_participants}명
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          template.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {template.is_active ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTemplate(template)}
                        >
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(template.id, template.is_active)}
                          className={template.is_active ? 'text-red-600' : 'text-green-600'}
                        >
                          {template.is_active ? '비활성화' : '활성화'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteTemplate(template.id, template.name)}
                          className="text-red-600 hover:text-red-700"
                        >
                          삭제
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 수정 모달 */}
        {editingTemplate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">템플릿 수정</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">모임 이름</label>
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">요일</label>
                  <select
                    value={editingTemplate.day_of_week}
                    onChange={(e) => setEditingTemplate({...editingTemplate, day_of_week: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded"
                  >
                    {DAYS_OPTIONS.map(day => (
                      <option key={day.value} value={day.value}>{day.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium mb-2">시작 시간</label>
                    <input
                      type="time"
                      value={editingTemplate.start_time}
                      onChange={(e) => setEditingTemplate({...editingTemplate, start_time: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">종료 시간</label>
                    <input
                      type="time"
                      value={editingTemplate.end_time}
                      onChange={(e) => setEditingTemplate({...editingTemplate, end_time: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">장소</label>
                  <input
                    type="text"
                    value={editingTemplate.location}
                    onChange={(e) => setEditingTemplate({...editingTemplate, location: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">최대 참가자</label>
                  <input
                    type="number"
                    value={editingTemplate.max_participants}
                    onChange={(e) => setEditingTemplate({...editingTemplate, max_participants: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded"
                    min="4"
                    max="50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">미리 생성할 일수</label>
                  <input
                    type="number"
                    value={editingTemplate.advance_days}
                    onChange={(e) => setEditingTemplate({...editingTemplate, advance_days: parseInt(e.target.value)})}
                    className="w-full p-2 border border-gray-300 rounded"
                    min="1"
                    max="30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">설명</label>
                  <textarea
                    value={editingTemplate.description || ''}
                    onChange={(e) => setEditingTemplate({...editingTemplate, description: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button 
                  onClick={() => handleUpdateTemplate(editingTemplate)}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  수정
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setEditingTemplate(null)}
                >
                  취소
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}
