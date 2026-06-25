'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchLevelInfoMap, getLevelScoreFromCode, type LevelInfoMap } from '@/lib/level-info';

type PairGroupDefinition = {
  groupName: string;
  pairNames: string[];
};

type PairTournamentFormat = 'round_robin' | 'knockout' | 'round_robin_knockout';

type PairGroupSetting = {
  groupName: string;
  pairNames: string[];
  format: PairTournamentFormat;
  roundRobinRepeats: number;
  knockoutQualifiers: number;
};

interface TeamAssignment {
  id: string;
  round_number: number;
  assignment_date: string;
  title: string;
  team_type: 'pairs';
  pairs_data?: Record<string, string[]>;
  pair_groups?: PairGroupDefinition[];
}

interface Match {
  id?: string;
  tournament_id: string;
  round: number;
  match_number: number;
  team1: string[];
  team2: string[];
  team1_levels?: number[];
  team2_levels?: number[];
  court: string;
  scheduled_time?: string;
  status: 'pending' | 'in_progress' | 'completed';
  score_team1?: number;
  score_team2?: number;
  winner?: 'team1' | 'team2' | 'draw';
}

interface Tournament {
  id: string;
  title: string;
  tournament_date: string;
  round_number: number;
  match_type: string;
  team_assignment_id: string;
  team_type: string;
  total_teams: number;
  matches_per_player: number;
  created_at: string;
}

type PairEntry = {
  name: string;
  players: string[];
  totalScore: number;
};

type TeamParticipantsModalState = {
  title: string;
  subtitle?: string;
  teams: { name: string; players: string[] }[];
} | null;

type GroupedPairMatches = {
  groupName: string;
  matches: Match[];
}[];

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const toPairsData = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const raw = (value as { pairs?: unknown }).pairs;
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : (value as Record<string, unknown>);

  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => /^pair\d+$/i.test(key))
      .map(([key, players]) => [key, toStringArray(players)])
      .filter(([, players]) => players.length > 0)
  );
};

const toPairGroupDefinitions = (value: unknown): PairGroupDefinition[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const group = item as { groupName?: unknown; pairNames?: unknown };
      const groupName = String(group.groupName || '').trim();
      const pairNames = toStringArray(group.pairNames)
        .map((pairName) => pairName.trim())
        .filter((pairName) => /^pair\d+$/i.test(pairName));

      if (!groupName || pairNames.length === 0) {
        return null;
      }

      return {
        groupName,
        pairNames: Array.from(new Set(pairNames)),
      };
    })
    .filter((group): group is PairGroupDefinition => Boolean(group));
};

const parsePairsPayload = (value: unknown): { pairsData: Record<string, string[]>; pairGroups: PairGroupDefinition[] } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      pairsData: toPairsData(value),
      pairGroups: [],
    };
  }

  const raw = value as { pairs?: unknown; groups?: unknown };

  return {
    pairsData: toPairsData(raw.pairs ?? value),
    pairGroups: toPairGroupDefinitions(raw.groups),
  };
};

const normalizeTeamAssignment = (assignment: any): TeamAssignment => {
  const parsedPairs = parsePairsPayload(assignment.pairs_data);

  return {
    id: assignment.id,
    round_number: assignment.round_number,
    assignment_date: assignment.assignment_date,
    title: assignment.title,
    team_type: 'pairs',
    pairs_data: parsedPairs.pairsData,
    pair_groups: parsedPairs.pairGroups,
  };
};

const formatTournamentTitle = (title: string) => {
  const match = title.match(/^(대회 경기 \d{4}-\d{2}-\d{2})\s*(?:라운드\d+)?\s*(.+?)(?:\s*-\s*\d+회차)?$/);
  if (match) {
    return {
      main: match[1],
      sub: match[2],
    };
  }
  return { main: title, sub: '' };
};

const formatDateDot = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[0]}. ${parseInt(parts[1], 10)}. ${parseInt(parts[2], 10)}.`;
  }
  return dateStr;
};

const getPairFormatLabel = (format: PairTournamentFormat) => {
  if (format === 'knockout') return '토너먼트';
  if (format === 'round_robin_knockout') return '리그후 토너먼트';
  return '풀리그';
};

const extractGroupLabelFromCourt = (court: string | undefined | null) => {
  if (!court) return '';
  const match = court.trim().match(/^\[(.+?)\]\s*Court\s*(.+)$/i);
  return match?.[1]?.trim() || '';
};

const formatCourtNameOnly = (court: string | undefined | null) => {
  if (!court) return '';
  const match = court.trim().match(/^\[(.+?)\]\s*Court\s*(.+)$/i);
  return match?.[2]?.trim() ? `Court ${match[2].trim()}` : court;
};

function PairTournamentSettingsContent() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  const [selectedAssignment, setSelectedAssignment] = useState<TeamAssignment | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [generatedMatches, setGeneratedMatches] = useState<Match[]>([]);
  const [pairGroupSettings, setPairGroupSettings] = useState<PairGroupSetting[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [numberOfCourts, setNumberOfCourts] = useState(4);
  const [tournamentDate, setTournamentDate] = useState('');
  const [levelInfoMap, setLevelInfoMap] = useState<LevelInfoMap>({});
  const [teamParticipantsModal, setTeamParticipantsModal] = useState<TeamParticipantsModalState>(null);
  const [tournamentMatchesModal, setTournamentMatchesModal] = useState<{
    title: string;
    subtitle?: string;
    teamType: string;
    matches: Match[];
  } | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);

  const assignmentIdQuery = searchParams.get('assignmentId');

  const getPlayerName = (nameWithLevel: string) =>
    nameWithLevel.replace(/\s*\([^)]*\)\s*$/, '').trim();

  const extractLevelFromName = (nameWithLevel: string): string => {
    const match = nameWithLevel.match(/\(([^)]+)\)(?!.*\()$/);
    return match ? match[1].toLowerCase().trim() : 'e2';
  };

  const getPlayerScore = (playerName: string): number =>
    getLevelScoreFromCode(levelInfoMap, extractLevelFromName(playerName), 0);

  const getPairEntriesFromAssignment = (assignment: TeamAssignment | null): PairEntry[] => {
    if (!assignment?.pairs_data) {
      return [];
    }

    return Object.entries(assignment.pairs_data)
      .map(([pairName, players]) => ({
        name: pairName,
        players,
        totalScore: players.reduce((sum, player) => sum + getPlayerScore(player), 0),
      }))
      .filter((pair) => pair.players.length > 0)
      .sort((left, right) => {
        const scoreDiff = right.totalScore - left.totalScore;
        if (Math.abs(scoreDiff) > 0.0001) {
          return scoreDiff;
        }

        return left.name.localeCompare(right.name, 'ko', { sensitivity: 'base' });
      });
  };

  const getPairGroupsFromAssignment = (assignment: TeamAssignment | null) => {
    const pairEntries = getPairEntriesFromAssignment(assignment);
    const pairMap = new Map(pairEntries.map((pair) => [pair.name, pair]));

    if (!assignment || pairEntries.length === 0) {
      return [];
    }

    if (assignment.pair_groups && assignment.pair_groups.length > 0) {
      return assignment.pair_groups
        .map((group) => ({
          groupName: group.groupName,
          pairs: group.pairNames
            .map((pairName) => pairMap.get(pairName))
            .filter((pair): pair is PairEntry => Boolean(pair)),
        }))
        .filter((group) => group.pairs.length > 0);
    }

    return [
      {
        groupName: '페어 그룹',
        pairs: pairEntries,
      },
    ];
  };

  const initializePairGroupSettings = (assignment: TeamAssignment | null) => {
    const groups = getPairGroupsFromAssignment(assignment);

    setPairGroupSettings(
      groups.map((group) => ({
        groupName: group.groupName,
        pairNames: group.pairs.map((pair) => pair.name),
        format: 'round_robin',
        roundRobinRepeats: 1,
        knockoutQualifiers: Math.min(4, Math.max(2, group.pairs.length >= 4 ? 4 : group.pairs.length)),
      }))
    );
  };

  const updatePairGroupSetting = (
    groupName: string,
    updater: (current: PairGroupSetting) => PairGroupSetting
  ) => {
    setPairGroupSettings((prev) =>
      prev.map((group) => (group.groupName === groupName ? updater(group) : group))
    );
  };

  const createPairMatch = (
    groupName: string,
    team1Pair: PairEntry,
    team2Pair: PairEntry,
    matchNumber: number,
    round: number,
    courtNumber: number
  ): Match => ({
    tournament_id: '',
    round,
    match_number: matchNumber,
    team1: team1Pair.players,
    team2: team2Pair.players,
    team1_levels: [team1Pair.totalScore],
    team2_levels: [team2Pair.totalScore],
    court: `[${groupName}] Court ${courtNumber}`,
    status: 'pending',
  });

  const createRoundRobinMatchesForPairs = (
    groupName: string,
    pairs: PairEntry[],
    repeatCount: number,
    roundOffset: number,
    matchNumberOffset: number,
    courtCount: number
  ) => {
    const matches: Match[] = [];
    let nextMatchNumber = matchNumberOffset;
    let nextRound = roundOffset;

    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      for (let leftIndex = 0; leftIndex < pairs.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < pairs.length; rightIndex += 1) {
          const matchNumber = nextMatchNumber++;
          matches.push(
            createPairMatch(
              groupName,
              pairs[leftIndex],
              pairs[rightIndex],
              matchNumber,
              nextRound,
              ((matchNumber - 1) % courtCount) + 1
            )
          );
        }
      }
      nextRound += 1;
    }

    return matches;
  };

  const createKnockoutOpeningMatchesForPairs = (
    groupName: string,
    pairs: PairEntry[],
    roundOffset: number,
    matchNumberOffset: number,
    courtCount: number
  ) => {
    const seededPairs = [...pairs].sort((left, right) => right.totalScore - left.totalScore);
    const matches: Match[] = [];
    let nextMatchNumber = matchNumberOffset;

    for (let leftIndex = 0, rightIndex = seededPairs.length - 1; leftIndex < rightIndex; leftIndex += 1, rightIndex -= 1) {
      const matchNumber = nextMatchNumber++;
      matches.push(
        createPairMatch(
          groupName,
          seededPairs[leftIndex],
          seededPairs[rightIndex],
          matchNumber,
          roundOffset,
          ((matchNumber - 1) % courtCount) + 1
        )
      );
    }

    return matches;
  };

  const scheduleMatchesOptimally = (rawMatches: Match[], courtCount: number): Match[] => {
    const unscheduled = [...rawMatches];
    const scheduled: Match[] = [];
    const lastRoundForPlayer = new Map<string, number>();
    const totalMatches = rawMatches.length;
    const totalRounds = Math.ceil(totalMatches / courtCount);

    for (let r = 1; r <= totalRounds; r += 1) {
      const currentRoundGroups: string[] = [];
      const currentRoundPlayers = new Set<string>();

      for (let c = 1; c <= courtCount; c += 1) {
        if (unscheduled.length === 0) break;

        let bestIndex = -1;
        let minPenalty = Infinity;

        for (let i = 0; i < unscheduled.length; i += 1) {
          const match = unscheduled[i];
          const matchPlayers = [...match.team1, ...match.team2].map(getPlayerName);
          const groupName = extractGroupLabelFromCourt(match.court);

          let penalty = 0;
          let isForbidden = false;

          // 1. 동일 라운드 중복 출전 방지
          for (let pIdx = 0; pIdx < matchPlayers.length; pIdx += 1) {
            if (currentRoundPlayers.has(matchPlayers[pIdx])) {
              isForbidden = true;
              break;
            }
          }
          if (isForbidden) {
            continue;
          }

          // 2. 대기 시간(쉬는 라운드 수)에 따른 페널티 계산
          for (let pIdx = 0; pIdx < matchPlayers.length; pIdx += 1) {
            const player = matchPlayers[pIdx];
            const lastR = lastRoundForPlayer.get(player);
            if (lastR !== undefined) {
              const gap = r - lastR;
              if (gap <= 0) {
                penalty += 10000000;
              } else if (gap === 1) {
                penalty += 1000000; // 연속 경기 페널티
              } else if (gap === 2) {
                penalty += 100000;  // 1경기 쉬고 경기
              } else if (gap === 3) {
                penalty += 10000;   // 2경기 쉬고 경기
              } else if (gap === 4) {
                penalty += 1000;    // 3경기 쉬고 경기
              }
            }
          }

          // 3. 한 라운드 내 코트별 그룹 섞기
          const groupCountInCurrentRound = currentRoundGroups.filter((g) => g === groupName).length;
          penalty += groupCountInCurrentRound * 50000;

          // 직전 라운드 동일 코트의 그룹 비교
          const prevMatchOnSameCourt = scheduled.find(
            (m) => m.round === r - 1 && m.court.endsWith(`Court ${c}`)
          );
          if (prevMatchOnSameCourt) {
            const prevGroupName = extractGroupLabelFromCourt(prevMatchOnSameCourt.court);
            if (prevGroupName === groupName) {
              penalty += 5000;
            }
          }

          // 4. 타이 브레이크 (매치 목록의 원래 인덱스 순서 유지)
          penalty += i * 0.1;

          if (penalty < minPenalty) {
            minPenalty = penalty;
            bestIndex = i;
          }
        }

        // 예외 대응: 모든 경기가 동일 라운드 중복 출전 규칙에 막힌 경우
        if (bestIndex === -1) {
          let fallbackBestIndex = -1;
          let fallbackMinPenalty = Infinity;
          for (let i = 0; i < unscheduled.length; i += 1) {
            const match = unscheduled[i];
            const matchPlayers = [...match.team1, ...match.team2].map(getPlayerName);
            const groupName = extractGroupLabelFromCourt(match.court);

            let penalty = 10000000; // 기본적으로 중복 출전 패널티

            for (let pIdx = 0; pIdx < matchPlayers.length; pIdx += 1) {
              const player = matchPlayers[pIdx];
              const lastR = lastRoundForPlayer.get(player);
              if (lastR !== undefined) {
                const gap = r - lastR;
                if (gap <= 1) penalty += 1000000;
                else if (gap === 2) penalty += 100000;
              }
            }

            const groupCountInCurrentRound = currentRoundGroups.filter((g) => g === groupName).length;
            penalty += groupCountInCurrentRound * 50000;
            penalty += i * 0.1;

            if (penalty < fallbackMinPenalty) {
              fallbackMinPenalty = penalty;
              fallbackBestIndex = i;
            }
          }
          bestIndex = fallbackBestIndex;
        }

        if (bestIndex !== -1) {
          const selectedMatch = unscheduled.splice(bestIndex, 1)[0];
          const selectedPlayers = [...selectedMatch.team1, ...selectedMatch.team2].map(getPlayerName);

          selectedPlayers.forEach((player) => {
            lastRoundForPlayer.set(player, r);
            currentRoundPlayers.add(player);
          });

          const groupName = extractGroupLabelFromCourt(selectedMatch.court);
          currentRoundGroups.push(groupName);

          const matchNumber = (r - 1) * courtCount + c;
          scheduled.push({
            ...selectedMatch,
            match_number: matchNumber,
            round: r,
            court: `[${groupName}] Court ${c}`,
          });
        }
      }
    }

    return scheduled;
  };

  const buildPairTournamentMatches = (assignment: TeamAssignment, settingsOverride?: PairGroupSetting[]) => {
    const pairGroups = getPairGroupsFromAssignment(assignment);
    const courtCount = Math.max(1, numberOfCourts);
    const configuredGroups =
      settingsOverride && settingsOverride.length > 0
        ? settingsOverride
        : pairGroupSettings;

    const matches: Match[] = [];
    let roundCursor = 1;
    let matchNumberCursor = 1;

    configuredGroups.forEach((groupConfig) => {
      const sourceGroup = pairGroups.find((group) => group.groupName === groupConfig.groupName);
      if (!sourceGroup) {
        return;
      }

      const configuredPairs = sourceGroup.pairs.filter((pair) => groupConfig.pairNames.includes(pair.name));
      if (configuredPairs.length < 2) {
        return;
      }

      if (groupConfig.format === 'round_robin') {
        const roundRobinMatches = createRoundRobinMatchesForPairs(
          groupConfig.groupName,
          configuredPairs,
          Math.max(1, groupConfig.roundRobinRepeats),
          roundCursor,
          matchNumberCursor,
          courtCount
        );
        matches.push(...roundRobinMatches);
        roundCursor += Math.max(1, groupConfig.roundRobinRepeats);
        matchNumberCursor += roundRobinMatches.length;
        return;
      }

      if (groupConfig.format === 'knockout') {
        const knockoutMatches = createKnockoutOpeningMatchesForPairs(
          groupConfig.groupName,
          configuredPairs,
          roundCursor,
          matchNumberCursor,
          courtCount
        );
        matches.push(...knockoutMatches);
        roundCursor += knockoutMatches.length > 0 ? 1 : 0;
        matchNumberCursor += knockoutMatches.length;
        return;
      }

      const roundRobinMatches = createRoundRobinMatchesForPairs(
        groupConfig.groupName,
        configuredPairs,
        Math.max(1, groupConfig.roundRobinRepeats),
        roundCursor,
        matchNumberCursor,
        courtCount
      );
      matches.push(...roundRobinMatches);
      roundCursor += Math.max(1, groupConfig.roundRobinRepeats);
      matchNumberCursor += roundRobinMatches.length;

      const qualifiers = [...configuredPairs]
        .sort((left, right) => right.totalScore - left.totalScore)
        .slice(0, Math.max(2, Math.min(groupConfig.knockoutQualifiers, configuredPairs.length)));

      const knockoutMatches = createKnockoutOpeningMatchesForPairs(
        groupConfig.groupName,
        qualifiers,
        roundCursor,
        matchNumberCursor,
        courtCount
      );
      matches.push(...knockoutMatches);
      roundCursor += knockoutMatches.length > 0 ? 1 : 0;
      matchNumberCursor += knockoutMatches.length;
    });

    return scheduleMatchesOptimally(matches, courtCount);
  };

  const getPairSettingsSummary = (settings = pairGroupSettings) =>
    settings
      .map((group) => {
        const base = `${group.groupName}:${getPairFormatLabel(group.format)}`;
        if (group.format === 'round_robin') {
          return `${base} ${group.roundRobinRepeats}회`;
        }
        if (group.format === 'round_robin_knockout') {
          return `${base} 리그 ${group.roundRobinRepeats}회 + ${group.knockoutQualifiers}강`;
        }
        return base;
      })
      .join(' / ');

  const getGeneratedPlayerGameCounts = (matches: Match[]) => {
    const counts: Record<string, number> = {};

    matches.forEach((match) => {
      [...match.team1, ...match.team2].forEach((player) => {
        const normalizedPlayerName = getPlayerName(player);
        counts[normalizedPlayerName] = (counts[normalizedPlayerName] || 0) + 1;
      });
    });

    return counts;
  };

  const groupGeneratedMatches = (matches: Match[]): GroupedPairMatches => {
    const grouped = new Map<string, Match[]>();

    matches.forEach((match) => {
      const groupName = extractGroupLabelFromCourt(match.court) || '기타 그룹';
      const current = grouped.get(groupName) || [];
      current.push(match);
      grouped.set(groupName, current);
    });

    return Array.from(grouped.entries()).map(([groupName, groupedMatches]) => ({
      groupName,
      matches: groupedMatches,
    }));
  };

  const pairAssignments = useMemo(
    () => teamAssignments.filter((assignment) => assignment.team_type === 'pairs'),
    [teamAssignments]
  );
  const groupedGeneratedMatches = useMemo(
    () => groupGeneratedMatches(generatedMatches),
    [generatedMatches]
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [assignmentsResponse, tournamentsResponse, levelMap] = await Promise.all([
          fetch('/api/admin/team-assignments'),
          fetch('/api/admin/tournaments'),
          fetchLevelInfoMap(supabase),
        ]);

        if (!assignmentsResponse.ok) {
          const payload = await assignmentsResponse.json().catch(() => ({}));
          throw new Error(payload?.error || '페어 팀 구성을 불러오지 못했습니다.');
        }

        if (!tournamentsResponse.ok) {
          const payload = await tournamentsResponse.json().catch(() => ({}));
          throw new Error(payload?.error || '대회 목록을 불러오지 못했습니다.');
        }

        const assignmentsPayload = await assignmentsResponse.json();
        const tournamentsPayload = await tournamentsResponse.json();

        setLevelInfoMap(levelMap);
        setTeamAssignments(
          (Array.isArray(assignmentsPayload?.teamAssignments) ? assignmentsPayload.teamAssignments : [])
            .map(normalizeTeamAssignment)
            .filter((assignment: TeamAssignment) => assignment.team_type === 'pairs')
        );
        const loadedTournaments = (Array.isArray(tournamentsPayload?.tournaments) ? tournamentsPayload.tournaments : []).filter(
            (tournament: Tournament) => tournament.team_type === 'pairs'
          );
        setTournaments(loadedTournaments);

        if (loadedTournaments.length > 0) {
          const tournamentIds = loadedTournaments.map((t: Tournament) => t.id);
          const { data: countsData, error: countsError } = await supabase
            .from('tournament_matches')
            .select('tournament_id')
            .in('tournament_id', tournamentIds);

          if (!countsError && countsData) {
            const counts: Record<string, number> = {};
            countsData.forEach((row: any) => {
              counts[row.tournament_id] = (counts[row.tournament_id] || 0) + 1;
            });
            setMatchCounts(counts);
          }
        }
      } catch (error) {
        console.error('페어 대회 페이지 로딩 오류:', error);
        setTeamAssignments([]);
        setTournaments([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [supabase]);

  useEffect(() => {
    if (!assignmentIdQuery || pairAssignments.length === 0 || selectedAssignment) {
      return;
    }

    const matchedAssignment = pairAssignments.find((assignment) => assignment.id === assignmentIdQuery);
    if (!matchedAssignment) {
      return;
    }

    setSelectedAssignment(matchedAssignment);
    setTournamentDate(matchedAssignment.assignment_date || '');
    setRoundNumber(1);
    setNumberOfCourts(4);
    setShowCreatePanel(true);
    initializePairGroupSettings(matchedAssignment);
  }, [assignmentIdQuery, pairAssignments, selectedAssignment]);

  useEffect(() => {
    if (!showCreatePanel || !selectedAssignment || pairGroupSettings.length === 0) {
      return;
    }

    setGeneratedMatches(buildPairTournamentMatches(selectedAssignment));
  }, [showCreatePanel, selectedAssignment, pairGroupSettings, numberOfCourts]);

  const openParticipantsModal = (assignment: TeamAssignment) => {
    const groups = getPairGroupsFromAssignment(assignment).map((group) => ({
      name: group.groupName,
      players: group.pairs.flatMap((pair) => pair.players),
    }));

    setTeamParticipantsModal({
      title: `${assignment.title} 참가자`,
      subtitle: `${assignment.assignment_date} · 페어전`,
      teams: groups,
    });
  };

  const openTournamentAssignmentModal = async (tournament: Tournament) => {
    try {
      const response = await fetch(`/api/admin/tournaments?include_matches=1&tournament_id=${tournament.id}`);
      if (!response.ok) throw new Error('대진 정보를 가져오지 못했습니다.');
      const data = await response.json();

      setTournamentMatchesModal({
        title: `${tournament.title} 배정현황`,
        subtitle: `${tournament.tournament_date} · ${tournament.round_number}회차 · 총 ${data.matches?.length || 0}경기`,
        teamType: tournament.team_type,
        matches: data.matches || [],
      });
    } catch (error) {
      console.error(error);
      alert('대진표 조회에 실패했습니다.');
    }
  };

  const handlePreviewMatches = (assignment: TeamAssignment) => {
    setSelectedAssignment(assignment);
    setTournamentDate(assignment.assignment_date || '');
    setRoundNumber(1);
    setNumberOfCourts(4);
    setShowCreatePanel(true);
    initializePairGroupSettings(assignment);
  };

  const handleRegenerateMatches = () => {
    if (!selectedAssignment) {
      return;
    }

    setGeneratedMatches(buildPairTournamentMatches(selectedAssignment));
  };

  const createTournament = async (targetGroupName?: string) => {
    try {
      if (!selectedAssignment) {
        alert('페어 구성을 선택해주세요.');
        return;
      }

      const matchesToCreate = targetGroupName
        ? generatedMatches.filter((match) => extractGroupLabelFromCourt(match.court) === targetGroupName)
        : generatedMatches;

      if (matchesToCreate.length === 0) {
        alert(targetGroupName ? `${targetGroupName} 경기가 없습니다.` : '생성된 경기가 없습니다.');
        return;
      }

      const activeSettings = targetGroupName
        ? pairGroupSettings.filter((group) => group.groupName === targetGroupName)
        : pairGroupSettings;

      const groupsLabel = targetGroupName || activeSettings.map((g) => g.groupName).join(', ');
      const formatLabel = activeSettings.map(group => {
        const fmt = getPairFormatLabel(group.format);
        if (group.format === 'round_robin' && group.roundRobinRepeats > 1) {
          return `${fmt} ${group.roundRobinRepeats}회`;
        }
        return fmt;
      }).join(', ');
      const title = `대회 경기 ${tournamentDate} 라운드${roundNumber} ${groupsLabel} - 페어 - ${formatLabel}`;
      const totalPairs = targetGroupName
        ? getPairGroupsFromAssignment(selectedAssignment).find((group) => group.groupName === targetGroupName)?.pairs.length || 0
        : getPairEntriesFromAssignment(selectedAssignment).length;

      const response = await fetch('/api/admin/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tournament: {
            title,
            tournament_date: tournamentDate,
            round_number: roundNumber,
            match_type: 'pairs_custom',
            team_assignment_id: selectedAssignment.id,
            team_type: 'pairs',
            total_teams: totalPairs,
            matches_per_player: 1,
          },
          matches: matchesToCreate,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '페어 대회 생성에 실패했습니다.');
      }

      const tournamentsResponse = await fetch('/api/admin/tournaments');
      const tournamentsPayload = await tournamentsResponse.json().catch(() => ({}));
      const nextTournaments = (Array.isArray(tournamentsPayload?.tournaments) ? tournamentsPayload.tournaments : []).filter(
        (tournament: Tournament) => tournament.team_type === 'pairs'
      );
      setTournaments(nextTournaments);

      if (nextTournaments.length > 0) {
        const { data: countsData, error: countsError } = await supabase
          .from('tournament_matches')
          .select('tournament_id')
          .in('tournament_id', nextTournaments.map((t: Tournament) => t.id));

        if (!countsError && countsData) {
          const counts: Record<string, number> = {};
          countsData.forEach((row: any) => {
            counts[row.tournament_id] = (counts[row.tournament_id] || 0) + 1;
          });
          setMatchCounts(counts);
        }
      }

      setShowCreatePanel(false);
      setSelectedAssignment(null);
      setGeneratedMatches([]);
      alert(targetGroupName ? `${targetGroupName} 대회가 생성되었습니다.` : '페어 대회가 생성되었습니다.');
    } catch (error) {
      console.error('페어 대회 생성 오류:', error);
      alert(error instanceof Error ? error.message : '페어 대회 생성 중 오류가 발생했습니다.');
    }
  };

  const deleteTournament = async (tournamentId: string) => {
    if (!confirm('이 페어 대회를 삭제하시겠습니까? 모든 경기 정보가 함께 삭제됩니다.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/tournaments', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tournamentId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || '페어 대회 삭제에 실패했습니다.');
      }

      setTournaments((prev) => prev.filter((tournament) => tournament.id !== tournamentId));
    } catch (error) {
      console.error('페어 대회 삭제 오류:', error);
      alert(error instanceof Error ? error.message : '페어 대회 삭제 중 오류가 발생했습니다.');
    }
  };

  const deleteAssignment = async (assignment: TeamAssignment) => {
    if (!confirm(`"${assignment.title}" 페어 구성을 삭제할까요?`)) {
      return;
    }

    try {
      setDeletingAssignmentId(assignment.id);

      const response = await fetch('/api/admin/team-assignments', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assignmentId: assignment.id }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || '페어 구성 삭제에 실패했습니다.');
      }

      setTeamAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
      if (selectedAssignment?.id === assignment.id) {
        setSelectedAssignment(null);
        setShowCreatePanel(false);
        setGeneratedMatches([]);
      }
    } catch (error) {
      console.error('페어 구성 삭제 오류:', error);
      alert(error instanceof Error ? error.message : '페어 구성 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingAssignmentId(null);
    }
  };

  const handleManageMatches = (tournament: Tournament) => {
    router.push(`/admin/tournament-bracket?tournament=${tournament.id}`);
  };

  return (
    <div className="w-full px-2 py-2 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl font-bold text-gray-900 sm:text-3xl">👥 페어 대회 설정</h1>
        <p className="mt-1 text-sm text-gray-600 sm:text-base">
          페어 구성별로 그룹 경기 방식을 따로 설정하고 페어 대회를 생성합니다.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:mb-6">
        일반 팀전은{' '}
        <Link href="/admin/tournament-matches" className="font-semibold underline">
          대회 경기
        </Link>
        {' '}페이지에서 계속 관리하고, 페어전만 이 페이지에서 별도로 생성합니다.
      </div>

      <div className="mb-6 rounded-lg bg-white p-4 shadow-md sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">페어 구성 선택</h2>
            <p className="mt-1 text-sm text-gray-500">team-management에서 만든 페어 구성을 기준으로 대회를 만듭니다.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/team-management')}
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            팀 관리
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-500">데이터를 불러오는 중입니다.</div>
        ) : pairAssignments.length === 0 ? (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-6 text-center text-yellow-900">
            등록된 페어 구성이 없습니다. 먼저 팀 관리에서 2명 팀 구성을 저장해주세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pairAssignments.map((assignment) => {
              const pairGroups = getPairGroupsFromAssignment(assignment);
              const pairCount = pairGroups.reduce((sum, group) => sum + group.pairs.length, 0);

              return (
                <div key={assignment.id} className="rounded-xl border border-gray-200 p-4 shadow-sm transition-colors hover:border-amber-400">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{assignment.title}</h3>
                      <p className="text-sm text-gray-500">{assignment.assignment_date}</p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      페어전
                    </span>
                  </div>
                  <div className="mb-4 space-y-1 text-sm text-gray-600">
                    <div>그룹 수: {pairGroups.length}</div>
                    <div>페어 수: {pairCount}</div>
                    <div>예상 참가 인원: {pairCount * 2}명</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openParticipantsModal(assignment)}
                      className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                    >
                      참가자
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreviewMatches(assignment)}
                      className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                    >
                      페어 대회 생성
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAssignment(assignment)}
                      disabled={deletingAssignmentId === assignment.id}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:bg-red-300"
                    >
                      {deletingAssignmentId === assignment.id ? '삭제중' : '삭제'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreatePanel && selectedAssignment && (
        <div className="mb-6 rounded-lg border-2 border-amber-300 bg-white p-4 shadow-md sm:p-6">
          <div className="mb-5 border-b border-gray-200 pb-4">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">페어 대회 생성</h2>
            <p className="mt-1 text-sm text-gray-600">{selectedAssignment.title}</p>
          </div>

          <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <div className="text-sm text-blue-900">
                그룹별로 경기 방식을 다르게 설정할 수 있습니다. 설정이 바뀌면 아래 미리보기를 다시 생성하세요.
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">회차</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={`pair-round-${num}`}
                      type="button"
                      onClick={() => setRoundNumber(num)}
                      className={`h-8 w-8 rounded text-sm font-semibold ${
                        roundNumber === num ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">코트</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={`pair-court-${num}`}
                      type="button"
                      onClick={() => setNumberOfCourts(num)}
                      className={`h-8 w-8 rounded text-sm font-semibold ${
                        numberOfCourts === num ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 text-sm text-blue-800">
              대회명 예시: <strong>대회 경기 {tournamentDate} 라운드{roundNumber} {pairGroupSettings.map(g => g.groupName).join(', ')} - 페어 - {pairGroupSettings.map(g => {
                const fmt = getPairFormatLabel(g.format);
                if (g.format === 'round_robin' && g.roundRobinRepeats > 1) {
                  return `${fmt} ${g.roundRobinRepeats}회`;
                }
                return fmt;
              }).join(', ')}</strong>
            </div>
          </div>

          <div className="mb-5 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              토너먼트와 리그후 토너먼트는 현재 생성 시점 기준의 오프닝 라운드를 만듭니다.
            </div>
            {pairGroupSettings.map((group) => (
              <div key={group.groupName} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{group.groupName}</div>
                    <div className="text-xs text-slate-500">{group.pairNames.length}개 페어</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['round_robin', '풀리그'],
                      ['knockout', '토너먼트'],
                      ['round_robin_knockout', '리그후 토너먼트'],
                    ] as Array<[PairTournamentFormat, string]>).map(([format, label]) => (
                      <button
                        key={`${group.groupName}-${format}`}
                        type="button"
                        onClick={() =>
                          updatePairGroupSetting(group.groupName, (current) => ({
                            ...current,
                            format,
                          }))
                        }
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                          group.format === format
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {group.format !== 'knockout' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">풀리그 반복 횟수</label>
                      <div className="flex gap-2">
                        {[1, 2, 3].map((repeat) => (
                          <button
                            key={`${group.groupName}-repeat-${repeat}`}
                            type="button"
                            onClick={() =>
                              updatePairGroupSetting(group.groupName, (current) => ({
                                ...current,
                                roundRobinRepeats: repeat,
                              }))
                            }
                            className={`h-9 w-9 rounded text-sm font-semibold ${
                              group.roundRobinRepeats === repeat
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {repeat}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {group.format === 'round_robin_knockout' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">본선 진출 페어 수</label>
                      <div className="flex gap-2">
                        {[2, 4, 8]
                          .filter((value) => value <= group.pairNames.length)
                          .map((qualifiers) => (
                            <button
                              key={`${group.groupName}-qualifier-${qualifiers}`}
                              type="button"
                              onClick={() =>
                                updatePairGroupSetting(group.groupName, (current) => ({
                                  ...current,
                                  knockoutQualifiers: qualifiers,
                                }))
                              }
                              className={`rounded px-3 py-2 text-sm font-semibold ${
                                group.knockoutQualifiers === qualifiers
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {qualifiers}강
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void createTournament(group.groupName)}
                    disabled={!generatedMatches.some((match) => extractGroupLabelFromCourt(match.court) === group.groupName)}
                    className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-50 disabled:text-amber-400"
                  >
                    {group.groupName} 생성
                  </button>
                </div>

                {(() => {
                  const groupMatches = generatedMatches.filter(
                    (match) => extractGroupLabelFromCourt(match.court) === group.groupName
                  );
                  if (groupMatches.length === 0) return null;

                  return (
                    <div className="mt-6 border-t border-slate-200 pt-4">
                      <div className="mb-3">
                        <h4 className="text-sm font-bold text-slate-800">생성될 경기 ({groupMatches.length}경기)</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {groupMatches.map((match) => {
                          const team1Score = (match.team1_levels || []).reduce((sum, score) => sum + score, 0);
                          const team2Score = (match.team2_levels || []).reduce((sum, score) => sum + score, 0);

                          return (
                            <div key={`pair-match-${group.groupName}-${match.match_number}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                                <span>라운드 {match.round}</span>
                                <span>{formatCourtNameOnly(match.court)}</span>
                                <span>경기 #{match.match_number}</span>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                <div className="rounded bg-white p-2 border border-slate-100 shadow-sm">
                                  <div className="text-xs font-semibold text-slate-900 truncate">{match.team1.map(getPlayerName).join(' / ')}</div>
                                  <div className="mt-1 text-[10px] text-slate-500">합계 점수 {team1Score.toFixed(1)}</div>
                                </div>
                                <div className="text-center text-[10px] font-bold text-slate-400">VS</div>
                                <div className="rounded bg-white p-2 border border-slate-100 shadow-sm">
                                  <div className="text-xs font-semibold text-slate-900 truncate">{match.team2.map(getPlayerName).join(' / ')}</div>
                                  <div className="mt-1 text-[10px] text-slate-500">합계 점수 {team2Score.toFixed(1)}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          <div className="mb-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleRegenerateMatches}
              className="rounded-lg bg-purple-600 px-6 py-2 font-medium text-white transition-colors hover:bg-purple-700"
            >
              대진표 다시 생성
            </button>
            <button
              type="button"
              onClick={() => void createTournament()}
              disabled={generatedMatches.length === 0}
              className="rounded-lg bg-amber-600 px-6 py-2 font-medium text-white transition-colors hover:bg-amber-700 disabled:bg-amber-200"
            >
              페어 대회 생성
            </button>
          </div>


        </div>
      )}

      <div className="rounded-lg bg-white p-4 shadow-md sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 sm:text-xl">생성된 페어 대회</h2>
        {tournaments.length === 0 ? (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-6 text-center text-yellow-900">
            아직 생성된 페어 대회가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tournaments.map((tournament) => {
              const { main, sub } = formatTournamentTitle(tournament.title);
              return (
                <div key={tournament.id} className="rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="mb-3">
                    <h3 className="text-base font-bold text-gray-900 leading-tight">
                      <div className="text-sm font-normal text-gray-500">{main}</div>
                      {sub && <div className="mt-1 text-base font-bold text-gray-900">{sub}</div>}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm text-gray-600 border-t border-gray-100 pt-2">
                      <div>{formatDateDot(tournament.tournament_date)}</div>
                      <div>{tournament.round_number}회차</div>
                      <div>{matchCounts[tournament.id] || 0}경기</div>
                      <div className="text-xs font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded inline-block mt-1">
                        페어전
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openTournamentAssignmentModal(tournament)}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    배정현황
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManageMatches(tournament)}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    경기 관리
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteTournament(tournament.id)}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {teamParticipantsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{teamParticipantsModal.title}</h3>
                {teamParticipantsModal.subtitle && (
                  <p className="mt-1 text-sm text-gray-500">{teamParticipantsModal.subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTeamParticipantsModal(null)}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                닫기
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              {teamParticipantsModal.teams.map((team) => (
                <div key={team.name} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="mb-3 text-base font-semibold text-gray-900">{team.name}</h4>
                  <div className="space-y-2">
                    {team.players.map((player) => (
                      <div key={`${team.name}-${player}`} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {player}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tournamentMatchesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl p-6">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white pb-4 mb-4 z-10">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{tournamentMatchesModal.title}</h3>
                {tournamentMatchesModal.subtitle && (
                  <p className="mt-1 text-sm text-gray-500">{tournamentMatchesModal.subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTournamentMatchesModal(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                닫기
              </button>
            </div>
            
            {tournamentMatchesModal.matches.length === 0 ? (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-5 text-center text-sm text-yellow-800">
                등록된 대진표가 없습니다.
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const grouped = new Map<string, Match[]>();
                  tournamentMatchesModal.matches.forEach((match) => {
                    const courtStr = match.court || '';
                    const matchLabel = courtStr.trim().match(/^\[(.+?)\]\s*Court\s*(.+)$/i);
                    const groupName = matchLabel?.[1]?.trim() || '일반';
                    const current = grouped.get(groupName) || [];
                    current.push(match);
                    grouped.set(groupName, current);
                  });
                  return Array.from(grouped.entries()).map(([groupName, groupedMatches]) => (
                    <div key={groupName} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="mb-3 text-base font-semibold text-slate-900">{groupName} ({groupedMatches.length}경기)</h4>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {groupedMatches.map((match) => {
                          const team1Score = (match.team1_levels || []).reduce((sum, score) => sum + score, 0);
                          const team2Score = (match.team2_levels || []).reduce((sum, score) => sum + score, 0);
                          const hasResult = match.score_team1 != null && match.score_team2 != null;

                          return (
                            <div key={match.id || `match-${match.match_number}`} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                                <span className="font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">{groupName}</span>
                                <span>{formatCourtNameOnly(match.court)}</span>
                                <span>경기 #{match.match_number}</span>
                              </div>
                              
                              <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg">
                                <div className="flex-1 text-right truncate">
                                  <span className="text-sm font-semibold text-gray-900">{match.team1.map(getPlayerName).join(' / ')}</span>
                                  {team1Score > 0 && <span className="ml-1 text-[10px] text-slate-400">({team1Score.toFixed(0)}점)</span>}
                                </div>
                                
                                <div className="flex items-center gap-1.5 shrink-0 px-2">
                                  {hasResult ? (
                                    <>
                                      <span className={`text-sm font-bold ${match.winner === 'team1' ? 'text-amber-700 font-extrabold' : 'text-gray-500'}`}>{match.score_team1}</span>
                                      <span className="text-xs font-bold text-gray-400">:</span>
                                      <span className={`text-sm font-bold ${match.winner === 'team2' ? 'text-amber-700 font-extrabold' : 'text-gray-500'}`}>{match.score_team2}</span>
                                    </>
                                  ) : (
                                    <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 bg-slate-200/60 rounded">VS</span>
                                  )}
                                </div>
                                
                                <div className="flex-1 text-left truncate">
                                  <span className="text-sm font-semibold text-gray-900">{match.team2.map(getPlayerName).join(' / ')}</span>
                                  {team2Score > 0 && <span className="ml-1 text-[10px] text-slate-400">({team2Score.toFixed(0)}점)</span>}
                                </div>
                              </div>

                              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 px-1">
                                <span>라운드 {match.round}</span>
                                {hasResult && (
                                  <span className="font-semibold text-emerald-600">
                                    종료 (우승: {match.winner === 'team1' ? '팀1' : match.winner === 'team2' ? '팀2' : '무승부'})
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PairTournamentSettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[400px] items-center justify-center bg-gray-50 rounded-xl border border-gray-100 p-8 shadow-sm">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm font-medium">설정 페이지를 불러오는 중입니다...</p>
        </div>
      </div>
    }>
      <PairTournamentSettingsContent />
    </Suspense>
  );
}
