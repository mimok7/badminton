'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { getSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { NotificationService } from '@/utils/notification-service';
import { getUserLevelDisplay } from '@/lib/level-display';
import { getProfileByUserId } from '@/lib/auth';
import {
  fetchMyTournamentMatches,
  normalizeTournamentPlayerName,
  type MyTournamentMatchView,
} from '@/lib/tournament-matches';

// 경기 결과 표시 컴포넌트
function MatchResultDisplay({ selectedMatch, user, supabase }: {
  selectedMatch: MatchSchedule;
  user: any;
  supabase: any;
}) {
  const [matchResult, setMatchResult] = useState<any>(null);
  
  useEffect(() => {
    const fetchMatchResult = async () => {
      if (!selectedMatch?.id.startsWith('generated_')) return;
      
      const generatedMatchId = selectedMatch.id.replace('generated_', '');
      const { data, error } = await supabase
        .from('generated_matches')
        .select('match_result, status')
        .eq('id', generatedMatchId)
        .single();
        
      if (!error && data?.match_result) {
        setMatchResult(data.match_result);
      }
    };
    
    fetchMatchResult();
  }, [selectedMatch?.id]);
  
  if (!matchResult) {
    return (
      <div className="text-center text-gray-500">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500 mx-auto mb-2"></div>
        결과 조회 중...
      </div>
    );
  }
  
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between items-center">
        <span className="font-medium">승부 결과:</span>
        <span className="font-bold text-green-700">
          {matchResult.winner === 'team1' ? '🏆 라켓팀 승리' : '🏆 셔틀팀 승리'}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="font-medium">점수:</span>
        <span className="font-mono text-green-700 font-bold">
          {matchResult.score}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="font-medium">완료 시간:</span>
        <span className="text-green-600 text-xs">
          {new Date(matchResult.completed_at).toLocaleString('ko-KR')}
        </span>
      </div>
      {matchResult.recorded_by && (
        <div className="text-xs text-gray-500 mt-2 text-center">
          결과 기록자: {matchResult.recorded_by === user.id ? '나' : '다른 참가자'}
        </div>
      )}
    </div>
  );
}

interface MatchSchedule {
  id: string;
  match_date: string;
  start_time: string;
  end_time: string;
  location: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  description: string;
  generated_match?: {
    id: string | number;
    match_number: number;
    session_name: string;
    team1_player1: {
      id?: string;
      username?: string;
      full_name?: string;
      skill_level: string;
      skill_level_name: string;
    };
    team1_player2: {
      id?: string;
      username?: string;
      full_name?: string;
      skill_level: string;
      skill_level_name: string;
    };
    team2_player1: {
      id?: string;
      username?: string;
      full_name?: string;
      skill_level: string;
      skill_level_name: string;
    };
    team2_player2: {
      id?: string;
      username?: string;
      full_name?: string;
      skill_level: string;
      skill_level_name: string;
    };
  };
}

interface MyScheduleStats {
  totalMatches: number;
  upcomingMatches: number;
  completedMatches: number;
  winRate: number;
  wins: number;
  losses: number;
}

interface MatchRecord {
  id: string;
  matchNumber: number;
  date: string;
  result: 'win' | 'loss' | 'pending';
  score: string;
  teammates: string[];
  opponents: string[];
  isUserTeam1: boolean;
}

type MatchCenterTab = 'upcoming' | 'results' | 'tournaments';

export default function MySchedulePage() {
  const { user, profile, loading: userLoading, isAdmin } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseClient();
  
  // 모든 상태를 상단에 선언
  const [loading, setLoading] = useState(true);
  const [myMatches, setMyMatches] = useState<MatchSchedule[]>([]);
  const [matchRecords, setMatchRecords] = useState<MatchRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<MatchRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<MatchCenterTab>('upcoming');
  const [tournamentMatches, setTournamentMatches] = useState<MyTournamentMatchView[]>([]);
  const [allTournamentMatchCount, setAllTournamentMatchCount] = useState(0);
  const [stats, setStats] = useState<MyScheduleStats>({ 
    totalMatches: 0, 
    upcomingMatches: 0, 
    completedMatches: 0,
    winRate: 0,
    wins: 0,
    losses: 0
  });
  const [selectedMatch, setSelectedMatch] = useState<MatchSchedule | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [modalMode, setModalMode] = useState<'schedule' | 'complete'>('schedule');
  const [matchStatus, setMatchStatus] = useState<'scheduled' | 'in_progress' | 'completed' | 'cancelled'>('scheduled');
  const [matchResult, setMatchResult] = useState({
    winner: '' as 'team1' | 'team2' | '',
    score: ''
  });
  
  // 각 경기의 결과 입력 상태를 추적하는 state
  const [matchResultStates, setMatchResultStates] = useState<Record<string, boolean | null>>({});

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab === 'upcoming' || requestedTab === 'results' || requestedTab === 'tournaments') {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  // 경기 결과 상태 확인 함수
  const checkMatchResult = async (matchId: string) => {
    if (!matchId.startsWith('generated_')) return null;
    
    try {
      const generatedMatchId = matchId.replace('generated_', '');
      const { data, error } = await supabase
        .from('generated_matches')
        .select('match_result')
        .eq('id', Number(generatedMatchId))
        .single();
        
      return !error && data?.match_result ? true : false;
    } catch (error) {
      console.error('경기 결과 확인 실패:', error);
      return null;
    }
  };

  // 모든 경기의 결과 상태 업데이트
  const updateMatchResultStates = async () => {
    const states: Record<string, boolean | null> = {};
    
    for (const match of myMatches) {
      if (match.generated_match && match.status === 'in_progress') {
        const hasResult = await checkMatchResult(match.id);
        states[match.id] = hasResult;
      }
    }
    
    setMatchResultStates(states);
  };

  useEffect(() => {
    if (user) {
      fetchMySchedule();
    }
  }, [user]);

  useEffect(() => {
    if (user && profile) {
      fetchTournamentMatches();
    }
  }, [user, profile]);

  // 경기 목록이 변경될 때마다 결과 상태 업데이트
  useEffect(() => {
    if (myMatches.length > 0) {
      updateMatchResultStates();
    }
  }, [myMatches.length]); // 의존성을 단순화

  // 내 경기 조회 함수
  const fetchMySchedule = async () => {
    if (!user) return;
    
    console.log('🔍 내 경기 일정 조회 시작...');
    setLoading(true);

    try {
      const matchesWithDetails: MatchSchedule[] = [];

      // 1. 내가 참여한 경기 일정 조회 (일반 등록형 경기)
      const { data: registrationData, error: registrationError } = await supabase
        .from('match_participants')
        .select(`
          match_schedule:match_schedules(
            id,
            match_date,
            start_time,
            end_time,
            location,
            status,
            description
          )
        `)
        .eq('user_id', user.id);

      console.log('등록형 경기 조회 결과:', { data: registrationData, error: registrationError });

      if (!registrationError && registrationData && registrationData.length > 0) {
        registrationData.forEach((participant) => {
          if (participant.match_schedule) {
            const schedule = participant.match_schedule as any;
            matchesWithDetails.push({
              id: schedule.id,
              match_date: schedule.match_date,
              start_time: schedule.start_time,
              end_time: schedule.end_time,
              location: schedule.location,
              status: schedule.status,
              description: `등록형 경기 - ${schedule.description || ''}`,
            });
          }
        });
      }

      // 2. 내가 배정받은 경기 조회 (generated_matches 기반)
      const myProfile = profile || await getProfileByUserId(supabase, user.id);

      console.log('내 프로필 조회:', { myProfile, userId: user.id });

      if (myProfile?.id) {
        const { data: assignedMatches, error: assignedError } = await supabase
          .from('generated_matches')
          .select(`
            *,
            team1_player1:profiles!team1_player1_id(
              id, user_id, username, full_name, skill_level,
              level_info:level_info!skill_level(name)
            ),
            team1_player2:profiles!team1_player2_id(
              id, user_id, username, full_name, skill_level,
              level_info:level_info!skill_level(name)
            ),
            team2_player1:profiles!team2_player1_id(
              id, user_id, username, full_name, skill_level,
              level_info:level_info!skill_level(name)
            ),
            team2_player2:profiles!team2_player2_id(
              id, user_id, username, full_name, skill_level,
              level_info:level_info!skill_level(name)
            ),
            match_sessions(
              id,
              session_name,
              session_date
            )
          `)
          .or(`team1_player1_id.eq.${myProfile.id},team1_player2_id.eq.${myProfile.id},team2_player1_id.eq.${myProfile.id},team2_player2_id.eq.${myProfile.id}`)
          .order('match_number', { ascending: true }); // 경기 순서 유지

        console.log('배정형 경기 조회 결과:', { 
          data: assignedMatches, 
          error: assignedError, 
          searchProfileId: myProfile.id,
          matchCount: assignedMatches?.length || 0
        });

        if (!assignedError && assignedMatches && assignedMatches.length > 0) {
          // 배정된 경기를 가상의 일정로 변환
          assignedMatches.forEach((match: any, index) => {
            const session = Array.isArray(match.match_sessions) ? match.match_sessions[0] : null; // 첫 번째 세션 정보 사용
            
            const getPlayerInfo = (playerData: any) => {
              if (!playerData) return { 
                id: null, 
                username: '미정', 
                full_name: '미정', 
                skill_level: 'E2',
                skill_level_name: getUserLevelDisplay('E2')
              };
              return {
                id: playerData.user_id,
                username: playerData.full_name || playerData.username || '미정',
                full_name: playerData.full_name || playerData.username || '미정',
                skill_level: playerData.skill_level || 'E2',
                skill_level_name: playerData.level_info?.name || getUserLevelDisplay(playerData.skill_level || 'E2')
              };
            };

            matchesWithDetails.push({
              id: `generated_${match.id}`,
              match_date: session?.session_date || new Date().toISOString().split('T')[0],
              start_time: `${9 + (index % 8)}:00`, // 9시부터 시작해서 8경기마다 순환
              end_time: `${10 + (index % 8)}:00`,
              location: '클럽 코트',
              status: (match.status || 'scheduled') as 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
              description: `관리자 배정 경기 - ${session?.session_name || '세션'}`,
              generated_match: {
                id: match.id,
                match_number: match.match_number,
                session_name: session?.session_name || '세션 정보 없음',
                team1_player1: getPlayerInfo(match.team1_player1),
                team1_player2: getPlayerInfo(match.team1_player2),
                team2_player1: getPlayerInfo(match.team2_player1),
                team2_player2: getPlayerInfo(match.team2_player2)
              }
            });
          });
        }
      } // myProfile 조건문 닫기

      // 날짜순 정렬
      matchesWithDetails.sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

      setMyMatches(matchesWithDetails);
      
      // 경기 기록 데이터 생성 (완료된 generated_matches만)
      const records: MatchRecord[] = [];
      let wins = 0;
      let losses = 0;

      if (myProfile?.id) {
        // 내가 참여한 완료된 경기들의 결과 조회
        const { data: completedMatches, error: completedError } = await supabase
          .from('generated_matches')
          .select(`
            id,
            match_number,
            match_result,
            status,
            team1_player1:profiles!team1_player1_id(
              id, user_id, username, full_name, skill_level
            ),
            team1_player2:profiles!team1_player2_id(
              id, user_id, username, full_name, skill_level
            ),
            team2_player1:profiles!team2_player1_id(
              id, user_id, username, full_name, skill_level
            ),
            team2_player2:profiles!team2_player2_id(
              id, user_id, username, full_name, skill_level
            ),
            match_sessions(
              session_date
            )
          `)
          .or(`team1_player1_id.eq.${myProfile.id},team1_player2_id.eq.${myProfile.id},team2_player1_id.eq.${myProfile.id},team2_player2_id.eq.${myProfile.id}`)
          .eq('status', 'completed')
          .not('match_result', 'is', null)
          .order('match_number', { ascending: false });

        if (!completedError && completedMatches) {
          completedMatches.forEach((match: any) => {
            if (!match.match_result) return;

            const result = match.match_result as any;
            const session = Array.isArray(match.match_sessions) ? match.match_sessions[0] : null;
            const sessionDate = session?.session_date || new Date().toISOString().split('T')[0];
            
            // 🔽 배열로 반환될 수 있으니 항상 첫 번째 값만 사용
            const team1_player1 = Array.isArray(match.team1_player1) ? match.team1_player1[0] : match.team1_player1;
            const team1_player2 = Array.isArray(match.team1_player2) ? match.team1_player2[0] : match.team1_player2;
            const team2_player1 = Array.isArray(match.team2_player1) ? match.team2_player1[0] : match.team2_player1;
            const team2_player2 = Array.isArray(match.team2_player2) ? match.team2_player2[0] : match.team2_player2;

            const isTeam1 = team1_player1?.id === myProfile.id || team1_player2?.id === myProfile.id;
            const myTeamWon = (isTeam1 && result.winner === 'team1') || (!isTeam1 && result.winner === 'team2');
            
            if (myTeamWon) wins++;
            else losses++;

            // 팀원과 상대방 이름 정리
            const teammates = isTeam1 
              ? [team1_player1, team1_player2]
              : [team2_player1, team2_player2];

            const opponents = isTeam1 
              ? [team2_player1, team2_player2]
              : [team1_player1, team1_player2];

            const getPlayerNames = (players: any[]) => 
              players
                .filter(p => p && p.user_id !== user.id) // 나 제외
                .map(p => p.username || p.full_name || '미정');

            records.push({
              id: String(match.id),
              matchNumber: match.match_number,
              date: sessionDate,
              result: myTeamWon ? 'win' : 'loss',
              score: result.score || '',
              teammates: getPlayerNames(teammates),
              opponents: getPlayerNames(opponents),
              isUserTeam1: isTeam1
            });
          });
        }
      }

      setMatchRecords(records);
      setFilteredRecords(records);
      
      // 통계 계산
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = matchesWithDetails.filter(m => m.match_date >= today && m.status === 'scheduled');
      const completed = matchesWithDetails.filter(m => m.status === 'completed');
      const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
      
      setStats({
        totalMatches: matchesWithDetails.length,
        upcomingMatches: upcoming.length,
        completedMatches: completed.length,
        winRate,
        wins,
        losses
      });

      console.log(`✅ 내 경기 일정 조회 완료: ${matchesWithDetails.length}개`);
    } catch (error) {
      console.error('경기 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 날짜 필터 변경 핸들러
  const handleDateFilter = (date: string) => {
    setSelectedDate(date);
    if (date === '') {
      setFilteredRecords(matchRecords);
    } else {
      const filtered = matchRecords.filter(record => record.date === date);
      setFilteredRecords(filtered);
    }
  };

  // 선수 이름 조회
  const getPlayerName = (player: any) => {
    if (!player) return '미정';
    if (player.id === user?.id) return '나';
    return player.full_name || player.username || '미정';
  };

  // 레벨 이름 반환 (데이터베이스에서 가져온 이름 사용)
  const getLevelName = (player: any) => {
    // 이미 skill_level_name이 있으면 그것을 사용
    if (player?.skill_level_name) {
      return player.skill_level_name;
    }
    return getUserLevelDisplay(player?.skill_level);
  };

  const fetchTournamentMatches = async () => {
    try {
      const result = await fetchMyTournamentMatches(supabase, profile);
      setTournamentMatches(result.matches);
      setAllTournamentMatchCount(result.allTournamentMatchCount);
    } catch (error) {
      console.error('대회 경기 조회 실패:', error);
      setTournamentMatches([]);
      setAllTournamentMatchCount(0);
    }
  };

  // 경기 상태 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // 경기 상태 텍스트
  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return '예정';
      case 'in_progress': return '진행중';
      case 'completed': return '완료';
      case 'cancelled': return '취소';
      default: return status;
    }
  };

  const uniqueRecordDates = Array.from(new Set(matchRecords.map((record) => record.date))).sort((a, b) =>
    new Date(b).getTime() - new Date(a).getTime()
  );

  const getMyTournamentTeam = (match: MyTournamentMatchView) => {
    const searchNames = [profile?.username, profile?.full_name]
      .map((value) => normalizeTournamentPlayerName(value))
      .filter((value) => value.length > 0);

    if (searchNames.length === 0) return null;

    const team1Names = (match.team1 || []).map((name) => normalizeTournamentPlayerName(name));
    const team2Names = (match.team2 || []).map((name) => normalizeTournamentPlayerName(name));

    if (searchNames.some((name) => team1Names.includes(name))) return 'team1';
    if (searchNames.some((name) => team2Names.includes(name))) return 'team2';
    return null;
  };

  const tournamentStats = tournamentMatches.reduce(
    (acc, match) => {
      const myTeam = getMyTournamentTeam(match);
      if (!myTeam) {
        return acc;
      }

      acc.total += 1;

      if (match.status === 'completed') {
        acc.completed += 1;
        if (match.winner === myTeam) acc.wins += 1;
        else if (match.winner === 'draw') acc.draws += 1;
        else acc.losses += 1;
      } else {
        acc.pending += 1;
      }

      return acc;
    },
    { total: 0, completed: 0, pending: 0, wins: 0, losses: 0, draws: 0 }
  );

  const selectTab = (tab: MatchCenterTab) => {
    setActiveTab(tab);
    router.replace(`/my-schedule?tab=${tab}`, { scroll: false });
  };

  // 경기 결과 보기/일정 상세 보기 핸들러 (통합)
  const handleScheduleDetails = (match: MatchSchedule) => {
    setSelectedMatch(match);
    setMatchStatus(match.status);
    setModalMode('schedule'); // 일정 확인 모드
    setShowDetailsModal(true);
    setMatchResult({ winner: '', score: '' });
  };

  // 완료 입력 핸들러 (진행중인 경우)
  const handleCompleteInput = (match: MatchSchedule) => {
    setSelectedMatch(match);
    setMatchStatus(match.status);
    setModalMode('complete'); // 완료 입력 모드
    setShowDetailsModal(true);
    setMatchResult({ winner: '', score: '' });
  };

  // 다음 경기 참가자들에게 준비 알림 발송
  const sendNextMatchNotification = async (currentMatch: MatchSchedule) => {
    if (!currentMatch.generated_match) return;

    try {
      // 현재 generated_matches에서 session_id 조회
      const { data: currentMatchData, error: currentMatchError } = await supabase
        .from('generated_matches')
        .select('session_id')
        .eq('id', Number(currentMatch.id.replace('generated_', '')))
        .single();

      if (currentMatchError || !currentMatchData) {
        console.error('현재 경기 session_id 조회 실패:', currentMatchError);
        return;
      }

      // 현재 경기와 같은 세션의 다음 경기들 찾기 (순서 유지)
      const { data: sessionMatches, error } = await supabase
        .from('generated_matches')
        .select(`
          *,
          team1_player1:profiles!team1_player1_id(user_id, username, full_name),
          team1_player2:profiles!team1_player2_id(user_id, username, full_name),
          team2_player1:profiles!team2_player1_id(user_id, username, full_name),
          team2_player2:profiles!team2_player2_id(user_id, username, full_name)
        `)
        .eq('session_id', currentMatchData.session_id)
        .gt('match_number', currentMatch.generated_match.match_number)
        .eq('status', 'scheduled') // 아직 시작하지 않은 경기만
        .order('match_number', { ascending: true })
        .limit(2); // 다음 경기와 그 다음 경기까지

      if (error) {
        console.error('다음 경기 조회 실패:', error);
        return;
      }

      if (!sessionMatches || sessionMatches.length === 0) {
        console.log('다음 예정된 경기가 없습니다.');
        return;
      }

      // 알림 메시지 준비
      const notificationMessage = `경기 준비 알림

빈 코트로 이동하여 경기를 시작해 주세요.
진행중 선택 시 다음 참가자에게 준비 알림이 발송됩니다.

부상 없이 즐거운 운동 하세요!`;

      let totalNotifications = 0;
      const notifiedPlayers: string[] = [];

      // 각 다음 경기의 참가자들에게 알림 발송
      for (const match of (sessionMatches as any[])) {
        const participants = [
          match.team1_player1,
          match.team1_player2,
          match.team2_player1,
          match.team2_player2
        ].filter(p => p && p.user_id);

        // 참가자별로 알림 기록 생성 및 실제 알림 발송
        for (const participant of participants) {
          const playerName = participant.full_name || participant.username || '선수';
          
          // 중복 발송 방지: 이미 같은 경기에 대한 준비 알림이 발송되었는지 확인
          const { data: existingNotification } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', participant.user_id)
            .eq('type', 'match_preparation')
            .eq('related_match_id', match.id)
            .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // 30분 내
            .single();

          if (existingNotification) {
            console.log(`⚠️ 중복 발송 방지: ${playerName}에게 이미 경기 #${match.match_number} 알림 발송됨`);
            continue; // 이미 발송된 경우 스킵
          }
          
          console.log(`🔔 알림 발송 대상: ${playerName} (경기 #${match.match_number})`);
          
          // 실제 브라우저 알림 + 소리 발송
          await NotificationService.sendMatchPreparationNotification(
            match.match_number, 
            [playerName]
          );
          
          notifiedPlayers.push(`${playerName} (경기#${match.match_number})`);
          
          // 알림 히스토리 기록
          try {
            await supabase.from('notifications').insert({
              user_id: participant.user_id,
              title: '경기 준비 알림',
              message: `경기 #${match.match_number} ${notificationMessage}`,
              type: 'match_preparation',
              related_match_id: match.id,
              is_read: false
            });
            totalNotifications++;
          } catch (notificationError) {
            console.error('알림 기록 저장 실패:', notificationError);
            // 알림 저장 실패는 전체 프로세스를 중단하지 않음
          }
        }
      }

      console.log(`✅ 다음 ${sessionMatches.length}경기의 ${totalNotifications}명에게 준비 알림을 발송했습니다.`);
      console.log(`📋 알림 발송 대상자: ${notifiedPlayers.join(', ')}`);
      
      return { 
        matchCount: sessionMatches.length, 
        playerCount: totalNotifications,
        players: notifiedPlayers
      };
      
    } catch (error) {
      console.error('다음 경기 알림 발송 실패:', error);
      // 알림 발송 실패는 사용자에게 별도 오류로 표시하지 않음 (부가 기능이므로)
    }
  };

  // 경기 상태 변경 핸들러
  const handleStatusChange = async (newStatus: 'scheduled' | 'in_progress' | 'completed' | 'cancelled') => {
    if (!selectedMatch) return;
    
    try {
      if (newStatus === 'completed') {
        // 완료를 선택한 경우: 완료 입력 모드로 전환
        setMatchStatus(newStatus);
        setModalMode('complete');
        // 실제 데이터베이스 업데이트는 결과 저장 시에 처리
      } else {
        // 다른 상태들: 바로 업데이트
        setMatchStatus(newStatus);
        await updateMatchStatus(newStatus);
        
        // 전체 일정 새로고침 (배정현황도 실시간 업데이트됨)
        await fetchMySchedule();
        
        // '진행중'으로 상태 변경 시 다음 경기 참가자들에게 알림 발송
        if (newStatus === 'in_progress' && selectedMatch.generated_match) {
          const notificationResult = await sendNextMatchNotification(selectedMatch);
          
          if (notificationResult && notificationResult.playerCount > 0) {
            // 성공적으로 알림 발송된 경우
            alert(`경기 상태가 "진행중"으로 변경되었습니다! 🏸

📢 다음 경기 참가자들에게 준비 알림을 발송했습니다:

🔔 ${notificationResult.playerCount}명에게 알림 발송
📋 대상자: ${notificationResult.players.join(', ')}

💬 발송 메시지:
"경기 준비 빈 코트로 이동 경기를 시작해 주세요.
진행중 선택이 다음 사람에게 준비 알림 발송됩니다.
부상 없이 즐거운 운동 하세요! 🏸"

💡 참가자들에게 브라우저 알림과 소리로 알림이 전송되었습니다.`);
          } else {
            alert(`경기 상태가 "진행중"으로 변경되었습니다.

ℹ️ 다음 예정된 경기가 없거나 알림 발송에 실패했습니다.`);
          }
        } else {
          // 성공 메시지
          const statusText = {
            'scheduled': '예정',
            'in_progress': '진행중', 
            'cancelled': '취소'
          }[newStatus];
          
          alert(`경기 상태가 "${statusText}"으로 변경되었습니다.`);
        }
      }
    } catch (error) {
      console.error('상태 변경 실패:', error);
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 경기 상태 업데이트 (수정된 버전 - match_participants 테이블 사용)
  const updateMatchStatus = async (status: string, result?: any) => {
    if (!selectedMatch) return;

    try {
      // generated_matches에서 온 경기인지 확인
      if (selectedMatch.id.startsWith('generated_')) {
        const generatedMatchId = selectedMatch.id.replace('generated_', '');
        
        // generated_matches 테이블의 상태 업데이트 (updated_at 컬럼 제거)
        const updateData: any = { 
          status: status
        };
        
        // 결과가 있는 경우 추가
        if (result) {
          updateData.match_result = result;
        }

        const { error: matchStatusError } = await supabase
          .from('generated_matches')
          .update(updateData)
          .eq('id', Number(generatedMatchId));

        if (matchStatusError) {
          console.error('Generated match 상태 업데이트 실패:', matchStatusError);
          throw matchStatusError;
        }

        console.log(`✅ 경기 상태 업데이트 완료: 경기 ${generatedMatchId}, 상태 ${status}`);
        
      } else {
        // 일반 match_schedules 테이블 업데이트 (기존 로직 유지)
        const { data: currentMatch, error: checkError } = await supabase
          .from('match_schedules')
          .select('status')
          .eq('id', selectedMatch.id)
          .single();

        if (checkError) {
          console.error('경기 상태 확인 실패:', checkError);
          throw checkError;
        }

        if (currentMatch.status === status) {
          alert(`이미 경기 상태가 "${getStatusText(status)}"입니다.`);
          return;
        }
        
        if (currentMatch.status === 'completed' && status !== 'completed') {
          alert('완료된 경기의 상태는 변경할 수 없습니다.');
          return;
        }

        const updateData: any = { status };
        if (result) {
          updateData.match_result = result;
        }

        const { error } = await supabase
          .from('match_schedules')
          .update(updateData)
          .eq('id', selectedMatch.id)
          .eq('status', currentMatch.status);

        if (error) {
          console.error('Match schedule 상태 업데이트 실패:', error);
          throw error;
        }
      }

      // 로컬 상태 업데이트는 새로고침에서 처리됨
    } catch (error) {
      console.error('상태 업데이트 실패:', error);
      throw error;
    }
  };

  // 경기 결과 저장 핸들러 (수정된 버전)
  const handleSaveResult = async () => {
    if (!selectedMatch || !matchResult.winner || !matchResult.score) {
      alert('승부 결과와 점수를 모두 입력해주세요.');
      return;
    }

    if (!selectedMatch.generated_match) {
      alert('배정된 경기가 아니므로 결과를 저장할 수 없습니다.');
      return;
    }

    // 현재 사용자 확인 (타입 가드)
    const currentUserId = user?.id;
    if (!currentUserId) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      const generatedMatchId = selectedMatch.id.replace('generated_', '');
      
      // 1. 현재 사용자가 이 경기의 참가자인지 확인
      const { data: currentMatch, error: matchError } = await supabase
        .from('generated_matches')
        .select(`
          *,
          team1_player1:profiles!team1_player1_id(user_id),
          team1_player2:profiles!team1_player2_id(user_id),
          team2_player1:profiles!team2_player1_id(user_id),
          team2_player2:profiles!team2_player2_id(user_id)
        `)
        .eq('id', Number(generatedMatchId))
        .single();

      if (matchError || !currentMatch) {
        console.error('경기 정보 조회 실패:', matchError);
        alert('경기 정보를 찾을 수 없습니다.');
        return;
      }

      // 참가자 권한 확인
      const currentMatchAny = currentMatch as any;
      const participantUserIds = [
        currentMatchAny.team1_player1?.user_id,
        currentMatchAny.team1_player2?.user_id,
        currentMatchAny.team2_player1?.user_id,
        currentMatchAny.team2_player2?.user_id
      ].filter(Boolean);

  if (!participantUserIds.includes(currentUserId)) {
        alert('이 경기의 참가자만 결과를 입력할 수 있습니다.');
        return;
      }

      // 2. 이미 완료된 경기인지 확인 (중복 저장 방지)
      if (currentMatch.status === 'completed' && currentMatch.match_result) {
        // 기존 결과가 있는 경우 사용자에게 확인
        const existingResult = currentMatch.match_result as any;
        const confirmOverwrite = confirm(
          `이미 저장된 결과가 있습니다.\n\n` +
          `기존 결과: ${existingResult.winner === 'team1' ? '라켓팀' : '셔틀팀'} 승리 (${existingResult.score})\n` +
          `새 결과: ${matchResult.winner === 'team1' ? '라켓팀' : '셔틀팀'} 승리 (${matchResult.score})\n\n` +
          `기존 결과를 덮어쓰시겠습니까?`
        );
        
        if (!confirmOverwrite) {
          return;
        }
      }

      // 3. 결과 데이터 준비
      const result = {
        winner: matchResult.winner,
        score: matchResult.score,
        completed_at: new Date().toISOString(),
  recorded_by: currentUserId, // 누가 기록했는지 추적
        participants: participantUserIds // 참가자 목록 기록
      };

      // 4. 트랜잭션으로 안전하게 업데이트 (동시성 제어)
      const { error: updateError } = await supabase
        .from('generated_matches')
        .update({
          status: 'completed',
          match_result: result
        })
        .eq('id', Number(generatedMatchId))
        .not('status', 'eq', 'completed'); // 이미 완료된 경기는 제외 (동시 저장 방지)

      if (updateError) {
        // PGRST116 = No rows updated (이미 다른 사람이 완료 처리한 경우)
        if (updateError.code === 'PGRST116') {
          alert('다른 참가자가 이미 결과를 저장했습니다.\n페이지를 새로고침하여 최신 정보를 확인해주세요.');
          await fetchMySchedule(); // 데이터 새로고침
          setShowDetailsModal(false);
          return;
        }
        
        console.error('결과 저장 실패:', updateError);
        alert('결과 저장 중 오류가 발생했습니다: ' + updateError.message);
        return;
      }

      // 5. 성공 메시지 및 모달 닫기
      alert(`경기 결과가 저장되었습니다! 🏆\n\n` +
            `승리팀: ${matchResult.winner === 'team1' ? '라켓팀' : '셔틀팀'}\n` +
            `점수: ${matchResult.score}\n\n` +
            `모든 참가자가 동일한 결과를 확인할 수 있습니다.`);
      
      // 모달 닫기 및 상태 초기화
      setShowDetailsModal(false);
      setModalMode('schedule');
      setMatchResult({ winner: '', score: '' });
      
      // 데이터 새로고침 (모든 참가자에게 즉시 반영)
      await fetchMySchedule();
      
      // 결과 상태 즉시 업데이트
      await updateMatchResultStates();
      
    } catch (error) {
      console.error('결과 저장 실패:', error);
      alert('결과 저장 중 예상치 못한 오류가 발생했습니다.');
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">로그인이 필요합니다.</p>
          <Link href="/login">
            <Button>로그인하기</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 min-h-screen">
      {/* 상단 인사말 섹션 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mb-8 text-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            🏸 내 경기 센터
          </h1>
          <Link href="/" className="text-white hover:text-blue-100 transition-colors">
            🏠 홈
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm mb-4">
          <span className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full">
            {profile?.full_name || profile?.username || '회원'}님
          </span>
          <span className="bg-white bg-opacity-20 text-white px-3 py-1 rounded-full">
            레벨: {getUserLevelDisplay(profile?.skill_level)}
          </span>
        </div>
        <p className="text-blue-100">
          예정 경기, 완료 기록, 대회 경기를 한 곳에서 확인하고 관리하세요! 📅
        </p>
      </div>

      {/* 승률 통계 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          📊 승률 통계
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-900">{stats.winRate}%</div>
            <div className="text-sm text-blue-600">승률</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-900">{stats.wins}</div>
            <div className="text-sm text-green-600">승</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-900">{stats.losses}</div>
            <div className="text-sm text-red-600">패</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-900">{stats.wins + stats.losses}</div>
            <div className="text-sm text-purple-600">총 완료 경기</div>
          </div>
        </div>
      </div>

      {/* 통계 섹션 */}
      <div className="grid grid-cols-3 gap-3 md:gap-6 mb-8">
        <div className="bg-blue-50 p-3 md:p-6 rounded-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <div className="text-lg md:text-2xl font-bold text-blue-900">{stats.totalMatches}</div>
            <div className="text-lg md:text-2xl">🏸</div>
          </div>
          <div className="text-xs md:text-base text-blue-600">전체 경기</div>
        </div>
        <div className="bg-green-50 p-3 md:p-6 rounded-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <div className="text-lg md:text-2xl font-bold text-green-900">{stats.upcomingMatches}</div>
            <div className="text-lg md:text-2xl">🏸</div>
          </div>
          <div className="text-xs md:text-base text-green-600">예정된 경기</div>
        </div>
        <div className="bg-purple-50 p-3 md:p-6 rounded-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <div className="text-lg md:text-2xl font-bold text-purple-900">{stats.completedMatches}</div>
            <div className="text-lg md:text-2xl">🏆</div>
          </div>
          <div className="text-xs md:text-base text-purple-600">완료된 경기</div>
        </div>
      </div>

      <div className="mb-8 rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectTab('upcoming')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'upcoming'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              예정 경기 {stats.upcomingMatches}
            </button>
            <button
              type="button"
              onClick={() => selectTab('results')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'results'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              완료 기록 {matchRecords.length}
            </button>
            <button
              type="button"
              onClick={() => selectTab('tournaments')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'tournaments'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              대회 경기 {tournamentMatches.length}
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'upcoming' && (
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">예정된 경기 목록</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>경기 일정을 불러오는 중...</p>
          </div>
        ) : myMatches.filter(m => m.status !== 'completed').length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">🏸</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">예정된 경기가 없습니다</h3>
            <p className="text-gray-600 mb-4">새로운 경기에 등록하거나 관리자의 배정을 기다려주세요.</p>
            <Link href="/match-registration">
              <Button>경기 등록하기</Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {myMatches.filter(m => m.status !== 'completed').map((match) => (
              <div key={match.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col md:flex-row md:items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {match.generated_match ? 
                          `경기 #${match.generated_match.match_number}` : 
                          `일정 ${match.match_date}`
                        }
                      </h3>
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(match.status)}`}>
                        {getStatusText(match.status)}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div className="flex items-center gap-2">
                        <span>📅</span>
                        <span>{match.match_date} {match.start_time} ~ {match.end_time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>📍</span>
                        <span>{match.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>📝</span>
                        <span>{match.description}</span>
                      </div>
                    </div>
                      
                    {match.generated_match && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <div className="text-sm font-medium text-gray-700 mb-3">
                          경기 구성 ({match.generated_match.session_name})
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:gap-3">
                          <div className="bg-blue-100 p-2 md:p-3 rounded-lg">
                            <div className="font-medium text-blue-900 mb-1 md:mb-2 text-sm md:text-base">팀 A</div>
                            <div className="space-y-1 text-xs md:text-sm">
                              <div className={`${match.generated_match.team1_player1.id === user?.id ? 'font-bold text-blue-900' : 'text-blue-700'}`}>
                                👤 {getPlayerName(match.generated_match.team1_player1)} ({getLevelName(match.generated_match.team1_player1)})
                              </div>
                              <div className={`${match.generated_match.team1_player2.id === user?.id ? 'font-bold text-blue-900' : 'text-blue-700'}`}>
                                👤 {getPlayerName(match.generated_match.team1_player2)} ({getLevelName(match.generated_match.team1_player2)})
                              </div>
                            </div>
                          </div>
                          <div className="bg-red-100 p-2 md:p-3 rounded-lg">
                            <div className="font-medium text-red-900 mb-1 md:mb-2 text-sm md:text-base">팀 B</div>
                            <div className="space-y-1 text-xs md:text-sm">
                              <div className={`${match.generated_match.team2_player1.id === user?.id ? 'font-bold text-red-900' : 'text-red-700'}`}>
                                👤 {getPlayerName(match.generated_match.team2_player1)} ({getLevelName(match.generated_match.team2_player1)})
                              </div>
                              <div className={`${match.generated_match.team2_player2.id === user?.id ? 'font-bold text-red-900' : 'text-red-700'}`}>
                                👤 {getPlayerName(match.generated_match.team2_player2)} ({getLevelName(match.generated_match.team2_player2)})
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 버튼은 실제 경기(generated_match)가 있는 경우에만 표시 */}
                  {match.generated_match && (
                    <div className="mt-4 md:mt-0 md:ml-6 flex flex-col gap-2">
                      {match.status === 'scheduled' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleScheduleDetails(match)}
                        >
                          🏸 일정 확인
                        </Button>
                      )}
                      {match.status === 'in_progress' && (
                        <>
                          {/* 결과 상태에 따라 버튼 표시 */}
                          {(() => {
                            const hasResult = matchResultStates[match.id];
                            
                            if (hasResult === null) {
                              return (
                                <Button variant="outline" size="sm" disabled>
                                  확인 중...
                                </Button>
                              );
                            }
                            
                            return hasResult ? (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleScheduleDetails(match)}
                                className="border-green-300 text-green-700 hover:bg-green-50"
                              >
                                🏆 결과 보기
                              </Button>
                            ) : (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleCompleteInput(match)}
                                className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                              >
                                ✅ 완료 입력
                              </Button>
                            );
                          })()}
                        </>
                      )}
                      {match.status === 'completed' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleScheduleDetails(match)}
                          className="border-green-300 text-green-700 hover:bg-green-50"
                        >
                          🏆 결과 보기
                        </Button>
                      )}
                      {match.status === 'cancelled' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled
                          className="border-gray-300 text-gray-500"
                        >
                          취소됨
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {activeTab === 'results' && (
        <div className="rounded-lg bg-white shadow">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">완료된 경기 기록</h2>
              <p className="mt-1 text-sm text-gray-500">완료된 배정 경기의 승패와 점수를 확인합니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="record-date-filter" className="text-sm font-medium text-gray-600">
                날짜 필터
              </label>
              <select
                id="record-date-filter"
                value={selectedDate}
                onChange={(e) => handleDateFilter(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">전체</option>
                {uniqueRecordDates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="mb-4 text-6xl">🏆</div>
              <h3 className="mb-2 text-lg font-medium text-gray-900">완료된 경기 기록이 없습니다</h3>
              <p>경기가 완료되면 여기에서 결과를 확인할 수 있습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredRecords.map((record) => (
                <div key={record.id} className="p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold text-gray-900">경기 #{record.matchNumber}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                          record.result === 'win'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {record.result === 'win' ? '승리' : '패배'}
                        </span>
                        <span className="text-sm text-gray-500">{record.date}</span>
                      </div>
                      <div className="text-sm text-gray-600">점수: {record.score || '기록 없음'}</div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div>팀원: {record.teammates.length > 0 ? record.teammates.join(', ') : '없음'}</div>
                      <div>상대: {record.opponents.length > 0 ? record.opponents.join(', ') : '없음'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'tournaments' && (
        <div className="rounded-lg bg-white shadow">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">대회 경기</h2>
              <p className="mt-1 text-sm text-gray-500">토너먼트 경기와 결과를 이곳에서 함께 확인합니다.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-amber-50 px-4 py-3">
                <div className="text-lg font-bold text-amber-900">{tournamentStats.total}</div>
                <div className="text-xs text-amber-700">총 경기</div>
              </div>
              <div className="rounded-lg bg-green-50 px-4 py-3">
                <div className="text-lg font-bold text-green-900">{tournamentStats.wins}</div>
                <div className="text-xs text-green-700">승리</div>
              </div>
              <div className="rounded-lg bg-blue-50 px-4 py-3">
                <div className="text-lg font-bold text-blue-900">{tournamentStats.pending}</div>
                <div className="text-xs text-blue-700">대기</div>
              </div>
            </div>
          </div>

          {tournamentMatches.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="mb-4 text-6xl">🎾</div>
              <h3 className="mb-2 text-lg font-medium text-gray-900">
                {allTournamentMatchCount === 0 ? '등록된 대회 경기가 아직 없습니다' : '참가한 대회 경기가 없습니다'}
              </h3>
              <p>대회가 생성되면 이 탭에서 일반 경기와 분리해서 확인할 수 있습니다.</p>
            </div>
          ) : (
            <div className="space-y-4 p-6">
              {tournamentMatches.map((match) => {
                const myTeam = getMyTournamentTeam(match);
                const didIWin = match.status === 'completed' && match.winner === myTeam;
                const didILose =
                  match.status === 'completed' &&
                  match.winner &&
                  match.winner !== myTeam &&
                  match.winner !== 'draw';

                return (
                  <div
                    key={match.id}
                    className={`rounded-lg border-2 p-4 ${
                      didIWin
                        ? 'border-green-300 bg-green-50'
                        : didILose
                        ? 'border-red-300 bg-red-50'
                        : match.status === 'pending'
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-300 bg-gray-50'
                    }`}
                  >
                    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-lg font-bold text-gray-900">{match.tournament_title}</div>
                        <div className="text-sm text-gray-600">
                          📅 {match.tournament_date ? new Date(match.tournament_date).toLocaleDateString('ko-KR') : '날짜 미정'} |
                          경기 {match.match_number} | 🏟️ {match.court}
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                        match.status === 'completed'
                          ? didIWin
                            ? 'bg-green-200 text-green-800'
                            : didILose
                            ? 'bg-red-200 text-red-800'
                            : 'bg-gray-200 text-gray-800'
                          : match.status === 'pending'
                          ? 'bg-blue-200 text-blue-700'
                          : 'bg-yellow-200 text-yellow-800'
                      }`}>
                        {match.status === 'completed'
                          ? didIWin
                            ? '✓ 승리'
                            : didILose
                            ? '✗ 패배'
                            : '= 무승부'
                          : match.status === 'pending'
                          ? '⏳ 대기중'
                          : '⚡ 진행중'}
                      </span>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                      <div className={`rounded-lg p-3 text-center ${myTeam === 'team1' ? 'border-2 border-blue-400 bg-blue-100' : 'bg-white'}`}>
                        <div className="mb-2 font-semibold text-blue-700">{myTeam === 'team1' ? '🌟 내 팀' : '상대 팀'}</div>
                        {match.team1.map((player, index) => (
                          <div key={`${match.id}-team1-${index}`} className="text-sm text-gray-800">
                            {player}
                          </div>
                        ))}
                        {match.status === 'completed' && (
                          <div className="mt-2 text-2xl font-bold text-blue-600">{match.score_team1}</div>
                        )}
                      </div>

                      <div className="text-2xl font-bold text-gray-400">VS</div>

                      <div className={`rounded-lg p-3 text-center ${myTeam === 'team2' ? 'border-2 border-blue-400 bg-blue-100' : 'bg-white'}`}>
                        <div className="mb-2 font-semibold text-red-700">{myTeam === 'team2' ? '🌟 내 팀' : '상대 팀'}</div>
                        {match.team2.map((player, index) => (
                          <div key={`${match.id}-team2-${index}`} className="text-sm text-gray-800">
                            {player}
                          </div>
                        ))}
                        {match.status === 'completed' && (
                          <div className="mt-2 text-2xl font-bold text-red-600">{match.score_team2}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 새로고침 및 알림 테스트 버튼 */}
      <div className="mt-8 text-center space-y-4">
        <Button 
          onClick={fetchMySchedule} 
          disabled={loading}
          variant="outline"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
              새로고침 중...
            </>
          ) : (
            '🔄 새로고침'
          )}
        </Button>
        
        {/* 알림 테스트 버튼 (관리자만 표시) */}
        {isAdmin && (
          <div className="flex gap-2 justify-center">
            <Button 
              onClick={async () => {
                await NotificationService.sendNotification(
                  '🏸 경기 준비 테스트',
                  '이것은 알림 시스템 테스트입니다.\n브라우저 알림과 소리가 정상적으로 작동하는지 확인해주세요.',
                  { playSound: true, showBrowserNotification: true }
                );
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              🔔 알림 테스트
            </Button>
            <Button 
              onClick={async () => {
                await NotificationService.sendMatchPreparationNotification(999, ['테스트 선수1', '테스트 선수2']);
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              🏸 경기 알림 테스트
            </Button>
          </div>
        )}
      </div>

      {/* 경기 상세 정보 모달 */}
      {showDetailsModal && selectedMatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* 모달 헤더 */}
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  🏸 경기 상세 정보
                </h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* 경기 기본 정보 */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-blue-700">📅 일정 정보</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">날짜:</span>
                    <span>{new Date(selectedMatch.match_date).toLocaleDateString('ko-KR', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      weekday: 'short'
                    })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">시간:</span>
                    <span>{selectedMatch.start_time} - {selectedMatch.end_time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">장소:</span>
                    <span>{selectedMatch.location}</span>
                  </div>
                </div>
              </div>

              {/* 상태 변경 섹션 - 일정 확인 모드에서만 표시 */}
              {modalMode === 'schedule' && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-purple-700">⚙️ 경기 상태</h3>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2"> {/* 완료 버튼 제거로 3열로 변경 */}
                      <button
                        onClick={() => handleStatusChange('scheduled')}
                        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                          matchStatus === 'scheduled' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-white text-blue-600 border border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        예정
                      </button>
                      <button
                        onClick={() => handleStatusChange('in_progress')}
                        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                          matchStatus === 'in_progress' 
                            ? 'bg-yellow-500 text-white' 
                            : 'bg-white text-yellow-600 border border-yellow-300 hover:bg-yellow-50'
                        }`}
                      >
                        진행중
                      </button>
                      <button
                        onClick={() => handleStatusChange('cancelled')}
                        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                          matchStatus === 'cancelled' 
                            ? 'bg-red-500 text-white' 
                            : 'bg-white text-red-600 border border-red-300 hover:bg-red-50'
                        }`}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 매치 정보 - 일정 확인 모드에서만 표시 */}
              {modalMode === 'schedule' && selectedMatch.generated_match && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-green-700">🏸 매치 정보</h3>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">경기 번호:</span>
                      <span className="text-lg font-bold text-blue-600">#{selectedMatch.generated_match.match_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">세션:</span>
                      <span>{selectedMatch.generated_match.session_name}</span>
                    </div>

                    {/* 팀 구성 */}
                    <div className="mt-4">
                      <h4 className="font-semibold mb-2 text-purple-700">👥 팀 구성</h4>
                      <div className="grid grid-cols-2 gap-2 md:gap-4">
                        {/* 라켓팀 */}
                        <div className="bg-blue-50 p-2 md:p-3 rounded-lg border-l-4 border-blue-400">
                          <h5 className="font-semibold text-blue-700 mb-1 md:mb-2 text-sm md:text-base">라켓팀</h5>
                          <div className="space-y-1 text-xs md:text-sm">
                            <div className="flex justify-between">
                              <span className="truncate pr-1">{getPlayerName(selectedMatch.generated_match.team1_player1)}</span>
                              <span className="text-blue-600 font-medium text-xs md:text-sm">
                                {getLevelName(selectedMatch.generated_match.team1_player1)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="truncate pr-1">{getPlayerName(selectedMatch.generated_match.team1_player2)}</span>
                              <span className="text-blue-600 font-medium">
                                {getLevelName(selectedMatch.generated_match.team1_player2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 셔틀팀 */}
                        <div className="bg-red-50 p-2 md:p-3 rounded-lg border-l-4 border-red-400">
                          <h5 className="font-semibold text-red-700 mb-1 md:mb-2 text-sm md:text-base">셔틀팀</h5>
                          <div className="space-y-1 text-xs md:text-sm">
                            <div className="flex justify-between">
                              <span className="truncate pr-1">{getPlayerName(selectedMatch.generated_match.team2_player1)}</span>
                              <span className="text-red-600 font-medium text-xs md:text-sm">
                                {getLevelName(selectedMatch.generated_match.team2_player1)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="truncate pr-1">{getPlayerName(selectedMatch.generated_match.team2_player2)}</span>
                              <span className="text-red-600 font-medium text-xs md:text-sm">
                                {getLevelName(selectedMatch.generated_match.team2_player2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 경기 결과 표시 (완료된 경기인 경우) */}
                    {matchStatus === 'completed' && selectedMatch.generated_match && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <h4 className="font-semibold text-green-800 mb-2">🏆 경기 결과</h4>
                        <MatchResultDisplay selectedMatch={selectedMatch} user={user} supabase={supabase} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 완료 입력 모드 - 결과 입력에 집중된 UI */}
              {modalMode === 'complete' && selectedMatch.generated_match && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-purple-700 mb-2">🏆 경기 결과 입력</h3>
                    <p className="text-gray-600">승리 팀과 점수를 기록해주세요</p>
                  </div>

                  {/* 팀 간단 정보 */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="text-center">
                        <div className="font-semibold text-blue-700 mb-1">라켓팀</div>
                        <div className="text-gray-600">
                          {getPlayerName(selectedMatch.generated_match.team1_player1)}, {getPlayerName(selectedMatch.generated_match.team1_player2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-red-700 mb-1">셔틀팀</div>
                        <div className="text-gray-600">
                          {getPlayerName(selectedMatch.generated_match.team2_player1)}, {getPlayerName(selectedMatch.generated_match.team2_player2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 승리 팀 선택 */}
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold mb-3 text-green-700">🏆 승리 팀</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setMatchResult(prev => ({ ...prev, winner: 'team1' }))}
                        className={`p-4 rounded-lg border-2 text-center font-medium transition-all ${
                          matchResult.winner === 'team1'
                            ? 'border-blue-500 bg-blue-100 text-blue-800 shadow-lg'
                            : 'border-gray-300 bg-white hover:border-blue-300 text-gray-700'
                        }`}
                      >
                        <div className="text-2xl mb-1">🏆</div>
                        <div className="font-bold text-blue-700">라켓팀</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {getPlayerName(selectedMatch.generated_match.team1_player1)}<br/>
                          {getPlayerName(selectedMatch.generated_match.team1_player2)}
                        </div>
                      </button>
                      <button
                        onClick={() => setMatchResult(prev => ({ ...prev, winner: 'team2' }))}
                        className={`p-4 rounded-lg border-2 text-center font-medium transition-all ${
                          matchResult.winner === 'team2'
                            ? 'border-red-500 bg-red-100 text-red-800 shadow-lg'
                            : 'border-gray-300 bg-white hover:border-red-300 text-gray-700'
                        }`}
                      >
                        <div className="text-2xl mb-1">🏆</div>
                        <div className="font-bold text-red-700">셔틀팀</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {getPlayerName(selectedMatch.generated_match.team2_player1)}<br/>
                          {getPlayerName(selectedMatch.generated_match.team2_player2)}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 점수 입력 */}
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold mb-3 text-purple-700">📊 점수 기록</h4>
                    <input
                      type="text"
                      placeholder="점수를 입력하세요 (예: 21-18, 21-19)"
                      value={matchResult.score}
                      onChange={(e) => setMatchResult(prev => ({ ...prev, score: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center text-lg font-mono"
                    />
                    <div className="text-sm text-gray-500 mt-2 text-center">
                      💡 점수 입력 예시: 21-18, 21-19 또는 21-15, 15-21, 21-17
                    </div>
                  </div>

                  {/* 저장 버튼 */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setModalMode('schedule');
                        setMatchResult({ winner: '', score: '' }); // 입력 초기화
                      }}
                      className="flex-1 px-4 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-semibold transition-colors"
                    >
                      ← 뒤로가기
                    </button>
                    <button
                      onClick={handleSaveResult}
                      disabled={!matchResult.winner || !matchResult.score}
                      className="flex-1 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors shadow-lg"
                    >
                      💾 결과 저장
                    </button>
                  </div>
                </div>
              )}

              {/* 모달 푸터 - 일정 확인 모드에서만 표시 */}
              {modalMode === 'schedule' && (
                <div className="flex justify-between pt-4 border-t border-gray-200">
                  {/* 왼쪽: 완료 입력 버튼 (진행중 상태일 때만 표시) */}
                  {matchStatus === 'in_progress' && (
                    <button
                      onClick={() => setModalMode('complete')}
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
                    >
                      📝 완료 입력
                    </button>
                  )}
                  
                  {/* 오른쪽: 닫기 버튼 */}
                  <div className="ml-auto">
                    <Button 
                      onClick={() => {
                        setShowDetailsModal(false);
                        setModalMode('schedule');
                        setMatchResult({ winner: '', score: '' });
                      }} 
                      variant="outline"
                    >
                      닫기
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
