const fs = require('fs');
let code = fs.readFileSync('src/app/(user)/my-schedule/page.tsx', 'utf8');

const lines = code.split(/\r?\n/);

// 1. Optimize upcoming matches card layout
const mapIdx = lines.findIndex(l => l.includes('upcomingMatches.map((match) => ('));
if (mapIdx !== -1) {
  const containerIdx = lines.findIndex((l, idx) => idx > mapIdx && l.includes('className="p-4"'));
  if (containerIdx !== -1) {
    lines[containerIdx] = lines[containerIdx].replace('className="p-4"', 'className="p-2.5 py-2"');
  }

  const flexIdx = lines.findIndex((l, idx) => idx > mapIdx && l.includes('className="flex flex-col gap-4"'));
  if (flexIdx !== -1) {
    lines[flexIdx] = lines[flexIdx].replace('className="flex flex-col gap-4"', 'className="flex flex-col gap-1.5"');
  }

  const badgeWrapperIdx = lines.findIndex((l, idx) => idx > mapIdx && l.includes('className="mb-3 flex flex-wrap'));
  if (badgeWrapperIdx !== -1) {
    lines[badgeWrapperIdx] = lines[badgeWrapperIdx].replace('className="mb-3 flex flex-wrap', 'className="mb-1.5 flex flex-wrap');
  }

  const cardBodyIdx = lines.findIndex((l, idx) => idx > mapIdx && l.includes('className="rounded-2xl bg-slate-50 px-4 py-3"'));
  if (cardBodyIdx !== -1) {
    lines[cardBodyIdx] = lines[cardBodyIdx].replace('className="rounded-2xl bg-slate-50 px-4 py-3"', 'className="rounded-xl bg-slate-50 px-3 py-1.5"');
  }

  const cardDetailsIdx = lines.findIndex((l, idx) => idx > cardBodyIdx && l.includes('className="flex flex-col gap-1.5"'));
  if (cardDetailsIdx !== -1) {
    lines[cardDetailsIdx] = lines[cardDetailsIdx].replace('className="flex flex-col gap-1.5"', 'className="flex flex-col gap-0.5"');
  }

  const subtitleIdx = lines.findIndex((l, idx) => idx > cardBodyIdx && l.includes('{getUpcomingCardSubtitle(match)}'));
  if (subtitleIdx !== -1) {
    lines.splice(subtitleIdx, 1);
  }

  const gridIdx = lines.findIndex((l, idx) => idx > cardBodyIdx && l.includes('className="mt-4 grid grid-cols-'));
  if (gridIdx !== -1) {
    lines[gridIdx] = lines[gridIdx].replace('className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3"', 'className="mt-2 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2"');
  }

  const t1Idx = lines.findIndex((l, idx) => idx > gridIdx && l.includes('bg-blue-50/80 p-3'));
  if (t1Idx !== -1) {
    lines[t1Idx] = lines[t1Idx].replace('bg-blue-50/80 p-3', 'bg-blue-50/80 p-2 rounded-xl');
  }
  const t2Idx = lines.findIndex((l, idx) => idx > gridIdx && l.includes('bg-rose-50/80 p-3'));
  if (t2Idx !== -1) {
    lines[t2Idx] = lines[t2Idx].replace('bg-rose-50/80 p-3', 'bg-rose-50/80 p-2 rounded-xl');
  }

  let searchIdx = gridIdx;
  for (let c = 0; c < 2; c++) {
    const spaceIdx = lines.findIndex((l, idx) => idx > searchIdx && l.includes('className="space-y-1.5 text-sm"'));
    if (spaceIdx !== -1) {
      lines[spaceIdx] = lines[spaceIdx].replace('className="space-y-1.5 text-sm"', 'className="space-y-1 text-xs"');
      searchIdx = spaceIdx;
    }
  }

  searchIdx = gridIdx;
  for (let c = 0; c < 4; c++) {
    const pxIdx = lines.findIndex((l, idx) => idx > searchIdx && l.includes('className={`rounded-xl px-2.5 py-2'));
    if (pxIdx !== -1) {
      lines[pxIdx] = lines[pxIdx].replace('rounded-xl px-2.5 py-2', 'rounded-lg px-2 py-1 text-xs');
      searchIdx = pxIdx;
    }
  }

  const vsIdx = lines.findIndex((l, idx) => idx > gridIdx && l.includes('className="flex min-w-[68px] flex-col'));
  if (vsIdx !== -1) {
    const newVsBlock = [
      "                            <div className=\"flex min-w-[56px] flex-col items-center justify-center rounded-xl bg-white px-1.5 py-1 text-center shadow-sm\">",
      "                              <div className=\"text-[9px] font-semibold tracking-[0.14em] text-slate-400\">점수</div>",
      "                              <div className=\"mt-0.5 flex items-center gap-0.5 text-slate-400 text-sm font-semibold\">",
      "                                <span>-</span>",
      "                                <span className=\"text-[10px] font-medium text-slate-300\">VS</span>",
      "                                <span>-</span>",
      "                              </div>",
      "                            </div>"
    ];
    lines.splice(vsIdx, 6, ...newVsBlock);
  }
}

// 2. Optimize results tab VS block to be horizontal
let resultsVsIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('className="flex min-w-[72px] flex-col') && i + 1 < lines.length && lines[i+1].includes('점수') && i + 4 < lines.length && lines[i+4].includes('opScore')) {
    resultsVsIndex = i;
    break;
  }
}

console.log('resultsVsIndex:', resultsVsIndex);

if (resultsVsIndex !== -1) {
  const newResultsVsBlock = [
    "                              <div className=\"flex min-w-[64px] flex-col items-center justify-center rounded-[16px] border border-slate-200 bg-white px-2 py-1.5 text-center shadow-sm\">",
    "                                <div className=\"text-[9px] font-semibold tracking-[0.14em] text-slate-400\">점수</div>",
    "                                <div className=\"mt-0.5 flex items-center gap-1\">",
    "                                  <span className=\"text-base font-bold text-blue-600\">{myScore}</span>",
    "                                  <span className=\"text-xs font-medium text-slate-400\">:</span>",
    "                                  <span className=\"text-base font-bold text-rose-600\">{opScore}</span>",
    "                                </div>",
    "                              </div>"
  ];
  lines.splice(resultsVsIndex, 6, ...newResultsVsBlock);
}

// 3. Optimize tournaments tab VS block to be horizontal
let tournamentVsIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('className="flex min-w-[72px] flex-col') && i + 1 < lines.length && lines[i+1].includes('점수') && i + 4 < lines.length && lines[i+4].includes('score_team2')) {
    tournamentVsIndex = i;
    break;
  }
}

console.log('tournamentVsIndex:', tournamentVsIndex);

if (tournamentVsIndex !== -1) {
  const newTournamentVsBlock = [
    "                        <div className=\"flex min-w-[64px] flex-col items-center justify-center rounded-[16px] bg-white px-2 py-1.5 text-center shadow-sm\">",
    "                          <div className=\"text-[9px] font-semibold tracking-[0.14em] text-slate-400\">점수</div>",
    "                          <div className=\"mt-0.5 flex items-center gap-1\">",
    "                            <span className=\"text-base font-bold text-blue-600\">{getTeamScoreText(match.score_team1)}</span>",
    "                            <span className=\"text-xs font-medium text-slate-400\">:</span>",
    "                            <span className=\"text-base font-bold text-rose-600\">{getTeamScoreText(match.score_team2)}</span>",
    "                          </div>",
    "                        </div>"
  ];
  lines.splice(tournamentVsIndex, 6, ...newTournamentVsBlock);
}

// 4. Optimize card padding in tournament matches
const tournamentCardIdx = lines.findIndex(l => l.includes('className={`relative rounded-[22px] border p-4'));
if (tournamentCardIdx !== -1) {
  lines[tournamentCardIdx] = lines[tournamentCardIdx].replace('p-4', 'p-3 py-2.5 rounded-xl');
}
const gap3Idx = lines.findIndex((l, idx) => idx > tournamentCardIdx && l.includes('className="mb-3 flex flex-col gap-3 pr-20"'));
if (gap3Idx !== -1) {
  lines[gap3Idx] = lines[gap3Idx].replace('mb-3 flex flex-col gap-3 pr-20', 'mb-2 flex flex-col gap-1 pr-20');
}
const teamBlocks = [];
lines.forEach((l, idx) => {
  if (idx > tournamentCardIdx && l.includes('rounded-[20px] p-3')) {
    teamBlocks.push(idx);
  }
});
teamBlocks.forEach(idx => {
  lines[idx] = lines[idx].replace('rounded-[20px] p-3', 'rounded-xl p-2.5');
});

fs.writeFileSync('src/app/(user)/my-schedule/page.tsx', lines.join('\n'));
console.log('Optimized schedule layout successfully!');
