  const fetchMySchedule = async () => {
    if (!user) return;
    
    console.log('?” ??ê²½ê¸° ?¼ì • ì¡°íšŒ ?œìž‘...');
    setLoading(true);

    try {
      const matchesWithDetails: MatchSchedule[] = [];
      const myProfile = profile || await getProfileByUserId(supabase, user.id);
      const participantIds = Array.from(
        new Set([myProfile?.id, myProfile?.user_id, user.id].filter((value): value is string => Boolean(value)))
      );
      const todayLocal = getTodayLocal();

      const [fetchedAssignedMatches, fetchedAllMatches, coinSettingsResponse] = await Promise.all([
        fetchScheduledMatchesForDate(supabase, todayLocal, user.id),
        fetchScheduledMatchesForDate(supabase, todayLocal),
        fetch('/api/coin-settings', { credentials: 'include' })
      ]);

      if (coinSettingsResponse.ok) {
        const payload = await coinSettingsResponse.json().catch(() => null);
        setCoinSettlementMode(payload?.coinSettings?.settlementMode || null);
      } else {
        setCoinSettlementMode(null);
      }

      setTodayAssignedMatches(fetchedAssignedMatches);
      setTodayAllMatches(fetchedAllMatches);
      
      const todayAssignedMatches = fetchedAssignedMatches;
      const assignedScheduleIds = new Set<string>();

      todayAssignedMatches.forEach((match, index) => {
        if (!match.generated_match_id) {
          return;
        }

        const syntheticId = `generated_${match.generated_match_id}`;
        assignedScheduleIds.add(syntheticId);

        // Find the global index in all scheduled matches
        const globalIndex = fetchedAllMatches.findIndex(m => m.id === match.id);
        const globalMatchNumber = globalIndex !== -1 ? globalIndex + 1 : (match.match_number ?? index + 1);

        matchesWithDetails.push({
          id: syntheticId,
          match_date: match.match_date || todayLocal,
          start_time: match.match_time || '?œê°„ ë¯¸ì •',
          end_time: match.match_time || '?œê°„ ë¯¸ì •',
          location: match.court_name || `ì½”íŠ¸ ${match.court_number || 'ë¯¸ì •'}`,
          status: (match.status || 'scheduled') as 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
          description: '?¤ëŠ˜ ë°°ì • ê²½ê¸°',
          kind: 'assigned',
          generated_match: {
            id: match.generated_match_id,
            session_id: null,
            match_number: globalMatchNumber,
            session_name: '?¤ëŠ˜ ë°°ì • ê²½ê¸°',
            team1_player1: {
              id: match.team1_player1 || undefined,
              username: match.team1_player1_name,
              full_name: match.team1_player1_name,
              coin_balance: match.team1_player1_coin_balance ?? null,
              skill_level: match.team1_player1_skill_level || 'E2',
              skill_level_name: match.team1_player1_skill_level_name || getLevelNameFromCode(levelInfoMap, match.team1_player1_skill_level || 'E2', match.team1_player1_skill_level || 'E2') || (match.team1_player1_skill_level || 'E2'),
            },
            team1_player2: {
              id: match.team1_player2 || undefined,
              username: match.team1_player2_name,
              full_name: match.team1_player2_name,
              coin_balance: match.team1_player2_coin_balance ?? null,
              skill_level: match.team1_player2_skill_level || 'E2',
              skill_level_name: match.team1_player2_skill_level_name || getLevelNameFromCode(levelInfoMap, match.team1_player2_skill_level || 'E2', match.team1_player2_skill_level || 'E2') || (match.team1_player2_skill_level || 'E2'),
            },
            team2_player1: {
              id: match.team2_player1 || undefined,
              username: match.team2_player1_name,
              full_name: match.team2_player1_name,
              coin_balance: match.team2_player1_coin_balance ?? null,
              skill_level: match.team2_player1_skill_level || 'E2',
              skill_level_name: match.team2_player1_skill_level_name || getLevelNameFromCode(levelInfoMap, match.team2_player1_skill_level || 'E2', match.team2_player1_skill_level || 'E2') || (match.team2_player1_skill_level || 'E2'),
            },
            team2_player2: {
              id: match.team2_player2 || undefined,
              username: match.team2_player2_name,
              full_name: match.team2_player2_name,
              coin_balance: match.team2_player2_coin_balance ?? null,
              skill_level: match.team2_player2_skill_level || 'E2',
              skill_level_name: match.team2_player2_skill_level_name || getLevelNameFromCode(levelInfoMap, match.team2_player2_skill_level || 'E2', match.team2_player2_skill_level || 'E2') || (match.team2_player2_skill_level || 'E2'),
            },
          },
        });
      });

      // 2. ?´ê? ë°°ì •ë°›ì? ê²½ê¸° ë°??„ë£Œ??ê²½ê¸° ì¡°íšŒ (RLS ?°íšŒë¥??„í•´ API ?¼ìš°???¬ìš©)
      console.log('???„ë¡œ??ì¡°íšŒ:', { myProfile, userId: user.id });

      let allMatches: any[] = [];
      let fetchError: any = null;

      if (participantIds.length > 0) {
        try {
          const response = await fetch('/api/user/generated-matches', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ participantIds }),
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
          }

          const resData = await response.json();
          allMatches = resData.matches || [];
          console.log('fetch matchesCount:', allMatches.length);
        } catch (err: any) {
          fetchError = err;
          console.error('fetchError:', err.message);
        }
      }

      const assignedMatches = allMatches
        .filter((m: any) => m.status !== 'completed')
        .sort((a: any, b: any) => (a.match_number || 0) - (b.match_number || 0));
      const assignedError = fetchError;

      console.log('ë°°ì •??ê²½ê¸° ì¡°íšŒ ê²°ê³¼:', { 
        data: assignedMatches, 
        error: assignedError, 
        searchProfileId: myProfile?.id || null,
        matchCount: assignedMatches?.length || 0
      });

      if (!assignedError && assignedMatches && assignedMatches.length > 0) {
        // ë°°ì •??ê²Œìž„??ê°€?ì˜ ?¼ì •ë¡?ë³€??        assignedMatches.forEach((match: any, index) => {
          const syntheticId = `generated_${match.id}`;
          if (assignedScheduleIds.has(syntheticId)) {
            return;
          }
          const session = Array.isArray(match.match_sessions) ? match.match_sessions[0] : match.match_sessions; // ì²?ë²ˆì§¸ ?¸ì…˜ ?•ë³´ ?¬ìš©
          
          const getPlayerInfo = (playerData: any) => {
            if (!playerData) return { 
              id: null, 
              user_id: null,
              username: 'ë¯¸ì •', 
              full_name: 'ë¯¸ì •', 
              coin_balance: null,
              skill_level: 'E2',
              skill_level_name: getLevelNameFromCode(levelInfoMap, 'E2', 'E2') || 'E2'
            };
            return {
              id: playerData.id,
              user_id: playerData.user_id,
              username: playerData.full_name || playerData.username || 'ë¯¸ì •',
              full_name: playerData.full_name || playerData.username || 'ë¯¸ì •',
              coin_balance: playerData.coin_balance ?? null,
              skill_level: playerData.skill_level || 'E2',
              skill_level_name: playerData.level_info?.name || getLevelNameFromCode(levelInfoMap, playerData.skill_level || 'E2', playerData.skill_level || 'E2') || (playerData.skill_level || 'E2')
            };
          };

          matchesWithDetails.push({
            id: syntheticId,
            match_date: session?.session_date || todayLocal,
            start_time: `${9 + (index % 8)}:00`, // 9?œë????œìž‘?´ì„œ 8ê²½ê¸°ë§ˆë‹¤ ?œí™˜
            end_time: `${10 + (index % 8)}:00`,
            location: '?´ëŸ½ ì½”íŠ¸',
            status: (match.status || 'scheduled') as 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
            description: session?.session_name || 'ë°°ì • ê²Œìž„',
            kind: 'assigned',
            generated_match: {
              id: match.id,
              session_id: match.session_id || session?.id || null,
              match_number: match.match_number,
              session_name: session?.session_name || '?¸ì…˜ ?•ë³´ ?†ìŒ',
              team1_player1: getPlayerInfo(match.team1_player1),
              team1_player2: getPlayerInfo(match.team1_player2),
              team2_player1: getPlayerInfo(match.team2_player1),
              team2_player2: getPlayerInfo(match.team2_player2)
            }
          });
        });
      }

      // ? ì§œ ë°??œê°„???•ë ¬
      matchesWithDetails.sort((a, b) => {
        const dateDiff = new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
        if (dateDiff !== 0) return dateDiff;
        const timeA = a.start_time || '23:59';
        const timeB = b.start_time || '23:59';
        return timeA.localeCompare(timeB);
      });

      setMyMatches(matchesWithDetails);
      
      // ê²½ê¸° ê¸°ë¡ ?°ì´???ì„± (?„ë£Œ??generated_matchesë§?
      const records: MatchRecord[] = [];
      let wins = 0;
      let losses = 0;

      if (participantIds.length > 0) {
        const completedMatches = allMatches
          .filter((m: any) => m.status === 'completed' && m.match_result !== null)
          .sort((a: any, b: any) => (b.match_number || 0) - (a.match_number || 0));
        const completedError = fetchError;

        if (completedError) {
          console.error('completedError:', completedError);
        }
        if (completedMatches) {
          console.log('completed matchesCount:', completedMatches.length);
        }
        if (!completedError && completedMatches) {
          completedMatches.forEach((match: any) => {
            if (!match.match_result) return;

            const result = match.match_result as any;
            const session = Array.isArray(match.match_sessions) ? match.match_sessions[0] : match.match_sessions;
            const sessionDate = session?.session_date || new Date().toISOString().split('T')[0];
            
            // ?”½ ë°°ì—´ë¡?ë°˜í™˜?????ˆìœ¼????ƒ ì²?ë²ˆì§¸ ê°’ë§Œ ?¬ìš©
            const team1_player1 = Array.isArray(match.team1_player1) ? match.team1_player1[0] : match.team1_player1;
            const team1_player2 = Array.isArray(match.team1_player2) ? match.team1_player2[0] : match.team1_player2;
            const team2_player1 = Array.isArray(match.team2_player1) ? match.team2_player1[0] : match.team2_player1;
            const team2_player2 = Array.isArray(match.team2_player2) ? match.team2_player2[0] : match.team2_player2;

            const isTeam1 = team1_player1?.id === myProfile?.id || team1_player2?.id === myProfile?.id;
            const myTeamWon = (isTeam1 && result.winner === 'team1') || (!isTeam1 && result.winner === 'team2');
            
            if (myTeamWon) wins++;
            else losses++;

            // ?€?ê³¼ ?ë?ë°??´ë¦„ ?•ë¦¬
            const teammates = isTeam1 
              ? [team1_player1, team1_player2]
              : [team2_player1, team2_player2];

            const opponents = isTeam1 
              ? [team2_player1, team2_player2]
              : [team1_player1, team1_player2];

            const getPlayerNames = (players: any[]) => 
              players
                .filter(p => p && p.user_id !== user.id) // ???œì™¸
                .map(p => formatNameWithCoins(p.username || p.full_name || 'ë¯¸ì •', p.coin_balance));

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
      
      // ?µê³„ ê³„ì‚°
        const upcoming = matchesWithDetails.filter(
          (m) =>
            m.match_date >= todayLocal &&
            (m.status === 'scheduled' || m.status === 'in_progress')
        );
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

      console.log(`Debug Info: total = ${records.length}, filtered = ${records.length}, loading = false, user = ${user?.id}`);
      console.log(`????ê²½ê¸° ?¼ì • ì¡°íšŒ ?„ë£Œ: ${matchesWithDetails.length}ê°?);
    } catch (error) {
      console.error('ê²½ê¸° ì¡°íšŒ ?¤íŒ¨:', error);
    } finally {
      setLoading(false);
    }
  };

  // ? ì§œ ?„í„° ë³€ê²??¸ë“¤??  const handleDateFilter = (date: string) => {
    setSelectedDate(date);
    if (date === '') {
      setFilteredRecords(matchRecords);
    } else {
      const filtered = matchRecords.filter(record => record.date === date);
