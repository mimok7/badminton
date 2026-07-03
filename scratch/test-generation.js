const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach((line) => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// page.tsx의 level_info.score 기준 레벨 점수 조회 로직
function getLevelScore(levelStr, levelInfoMap) {
  if (!levelStr) return 0;
  const clean = levelStr.toLowerCase().trim();
  return levelInfoMap[clean]?.score ?? 0;
}

function extractLevelFromName(nameWithLevel) {
  const match = nameWithLevel.match(/\(([^)]+)\)(?!.*\()$/);
  if (match) {
    return match[1].toLowerCase().trim();
  }
  return 'e2';
}

function getPlayerName(nameWithLevel) {
  return nameWithLevel.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function getPlayerScore(playerName, levelInfoMap) {
  return getLevelScore(extractLevelFromName(playerName), levelInfoMap);
}

function normalizePlayerLookupKey(value) {
  return String(value || '').trim();
}

function normalizeGender(value) {
  return String(value || '').trim().toUpperCase();
}

// 헬퍼: 팀 목록 추출
function getTeamsFromAssignment(assignment) {
  const teams = [];
  if (assignment.team_type === '2teams') {
    if (assignment.racket_team && assignment.racket_team.length > 0) {
      teams.push({ name: '라켓팀', players: assignment.racket_team });
    }
    if (assignment.shuttle_team && assignment.shuttle_team.length > 0) {
      teams.push({ name: '셔틀팀', players: assignment.shuttle_team });
    }
  } else if (assignment.team_type === '3teams') {
    if (assignment.team1 && assignment.team1.length > 0) teams.push({ name: '1팀', players: assignment.team1 });
    if (assignment.team2 && assignment.team2.length > 0) teams.push({ name: '2팀', players: assignment.team2 });
    if (assignment.team3 && assignment.team3.length > 0) teams.push({ name: '3팀', players: assignment.team3 });
  } else if (assignment.team_type === '4teams') {
    if (assignment.team1 && assignment.team1.length > 0) teams.push({ name: '1팀', players: assignment.team1 });
    if (assignment.team2 && assignment.team2.length > 0) teams.push({ name: '2팀', players: assignment.team2 });
    if (assignment.team3 && assignment.team3.length > 0) teams.push({ name: '3팀', players: assignment.team3 });
    if (assignment.team4 && assignment.team4.length > 0) teams.push({ name: '4팀', players: assignment.team4 });
  }
  return teams;
}

// page.tsx의 매칭 알고리즘을 모방
const buildTeamLockedPairsForRound = (
  teams,
  playerPool,
  playerMatchCount,
  pairMatchCount,
  mode
) => {
  const roundPairs = [];

  teams.forEach((team) => {
    const uniqueTeamPlayers = [...new Set(team.players)]
      .map((name) => playerPool.get(name))
      .filter(Boolean);

    if (uniqueTeamPlayers.length < 2) {
      return;
    }

    const sortedPlayers = [...uniqueTeamPlayers].sort((left, right) => {
      const matchDiff = (playerMatchCount[left.name] || 0) - (playerMatchCount[right.name] || 0);
      if (matchDiff !== 0) {
        return matchDiff;
      }

      if (mode === 'random') {
        return Math.random() < 0.5 ? -1 : 1;
      }

      return right.score - left.score;
    });

    const available = [...sortedPlayers];

    const takePreferredPartnerIndex = (anchor, pool) => {
      if (pool.length === 0) {
        return -1;
      }

      if (mode === 'mixed_doubles') {
        const anchorGender = normalizeGender(anchor.gender);
        const mixedIndex = pool.findIndex((candidate) => {
          const candidateGender = normalizeGender(candidate.gender);
          return anchorGender && candidateGender && anchorGender !== candidateGender;
        });

        if (mixedIndex >= 0) {
          return mixedIndex;
        }
      }

      let bestIndex = 0;
      let bestValue = Number.POSITIVE_INFINITY;

      pool.forEach((candidate, index) => {
        const nextPairScore = anchor.score + candidate.score;
        const pairKey = [anchor.name, candidate.name].sort((a, b) => a.localeCompare(b, 'ko')).join('::');
        const pairUsed = pairMatchCount[pairKey] || 0;
        const scoreGap = mode === 'level_based'
          ? Math.abs(anchor.score - candidate.score)
          : Math.abs(nextPairScore - anchor.score);
        const value = pairUsed * 1000 + scoreGap;

        if (value < bestValue) {
          bestValue = value;
          bestIndex = index;
        }
      });

      return bestIndex;
    };

    while (available.length >= 2) {
      const anchor = mode === 'level_based' ? available.shift() : available.pop();
      const partnerIndex = takePreferredPartnerIndex(anchor, available);

      if (partnerIndex < 0) {
        break;
      }

      const [partner] = available.splice(partnerIndex, 1);

      roundPairs.push({
        sourceTeam: team.name,
        players: [anchor, partner],
        totalScore: anchor.score + partner.score,
      });
    }
  });

  return roundPairs;
};

const matchTeamLockedPairs = (pairs, numberOfCourts) => {
  const matches = [];
  const used = new Set();

  const sortedPairs = [...pairs].sort((left, right) => right.totalScore - left.totalScore);

  for (let index = 0; index < sortedPairs.length; index += 1) {
    if (used.has(index)) {
      continue;
    }

    const current = sortedPairs[index];
    let bestOpponentIndex = -1;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (let opponentIndex = index + 1; opponentIndex < sortedPairs.length; opponentIndex += 1) {
      if (used.has(opponentIndex)) {
        continue;
      }

      const opponent = sortedPairs[opponentIndex];
      if (opponent.sourceTeam === current.sourceTeam) {
        continue;
      }

      const diff = Math.abs(current.totalScore - opponent.totalScore);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestOpponentIndex = opponentIndex;
      }
    }

    if (bestOpponentIndex < 0) {
      continue;
    }

    used.add(index);
    used.add(bestOpponentIndex);
    matches.push({
      left: current,
      right: sortedPairs[bestOpponentIndex],
    });
  }

  return matches;
};

async function run() {
  try {
    // 1. level_info 가져오기
    const { data: levelData, error: levelErr } = await supabase.from('level_info').select('*');
    if (levelErr) throw levelErr;
    const levelInfoMap = {};
    levelData.forEach(item => {
      levelInfoMap[item.code.toLowerCase().trim()] = item;
    });

    // 2. profiles 성별 정보 가져오기
    const { data: profileData, error: profileErr } = await supabase.from('profiles').select('username, full_name, gender');
    if (profileErr) throw profileErr;
    const playerGenderMap = {};
    profileData.forEach((profile) => {
      const candidates = [profile?.full_name, profile?.username]
        .map((value) => normalizePlayerLookupKey(String(value || '')))
        .filter(Boolean);
      candidates.forEach((candidate) => {
        if (!playerGenderMap[candidate] && profile?.gender) {
          playerGenderMap[candidate] = String(profile.gender);
        }
      });
    });

    // 3. 가장 최근의 team_assignments 조회 (2teams)
    const { data: assignments, error: assignErr } = await supabase
      .from('team_assignments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    if (assignErr) throw assignErr;
    
    if (assignments.length === 0) {
      console.log('No 2teams team assignment found.');
      return;
    }

    const assignment = assignments[0];
    console.log('Testing assignment:', assignment.title);

    const teams = getTeamsFromAssignment(assignment);
    const allPlayerNames = teams.flatMap(team => team.players);
    console.log('Total players:', allPlayerNames.length);

    const getPlayerGender = (playerName) => {
      const normalizedName = normalizePlayerLookupKey(getPlayerName(playerName));
      return playerGenderMap[normalizedName] || '';
    };

    const playersWithScores = [...new Set(allPlayerNames)].map(name => ({
      name,
      score: getPlayerScore(name, levelInfoMap),
      gender: getPlayerGender(name),
    })).sort((a, b) => b.score - a.score);

    const playerPool = new Map(playersWithScores.map((player) => [player.name, player]));

    // 테스트 1: level_based
    console.log('\n--- Testing level_based ---');
    const playerMatchCount = Object.fromEntries(playersWithScores.map((player) => [player.name, 0]));
    const pairMatchCount = {};
    const maxCourts = 4;
    const effectiveMatchesPerPlayer = 2;

    const totalRounds = Math.max(1, effectiveMatchesPerPlayer);
    const convertedMatches = [];

    for (let round = 1; round <= totalRounds; round += 1) {
      const pairsForRound = buildTeamLockedPairsForRound(
        teams,
        playerPool,
        playerMatchCount,
        pairMatchCount,
        'level_based'
      );
      console.log(`Round ${round} - Generated pairs count:`, pairsForRound.length);
      const matchedPairs = matchTeamLockedPairs(pairsForRound, maxCourts);
      console.log(`Round ${round} - Matched pairs count:`, matchedPairs.length);

      for (const { left, right } of matchedPairs) {
        convertedMatches.push({
          round,
          team1: left.players.map((p) => p.name),
          team2: right.players.map((p) => p.name),
        });

        [...left.players, ...right.players].forEach((player) => {
          playerMatchCount[player.name] = (playerMatchCount[player.name] || 0) + 1;
        });
      }
    }
    console.log('Result matches length:', convertedMatches.length);

    // 테스트 2: mixed_doubles
    console.log('\n--- Testing mixed_doubles ---');
    const playerMatchCountMD = Object.fromEntries(playersWithScores.map((player) => [player.name, 0]));
    const pairMatchCountMD = {};
    const convertedMatchesMD = [];

    for (let round = 1; round <= totalRounds; round += 1) {
      const pairsForRound = buildTeamLockedPairsForRound(
        teams,
        playerPool,
        playerMatchCountMD,
        pairMatchCountMD,
        'mixed_doubles'
      );
      console.log(`Round ${round} - Generated pairs count (MD):`, pairsForRound.length);
      const matchedPairs = matchTeamLockedPairs(pairsForRound, maxCourts);
      console.log(`Round ${round} - Matched pairs count (MD):`, matchedPairs.length);

      for (const { left, right } of matchedPairs) {
        convertedMatchesMD.push({
          round,
          team1: left.players.map((p) => p.name),
          team2: right.players.map((p) => p.name),
        });

        [...left.players, ...right.players].forEach((player) => {
          playerMatchCountMD[player.name] = (playerMatchCountMD[player.name] || 0) + 1;
        });
      }
    }
    console.log('Result matches (MD) length:', convertedMatchesMD.length);

  } catch (err) {
    console.error('Error during run:', err);
  }
}
run();
