import {
  GROUP_NUMBERS,
  type CoreMission,
  type GroupNumber,
  type MissionAllocationConfig,
  type Student,
} from '../../shared/types.ts';

export interface ScoreGroupBucket {
  label: string;
  targetGroupNumber: GroupNumber;
  students: Student[];
  count: number;
  totalScore: number;
  avgScore: number;
}

export interface TwoGroupScoreSplitResult {
  to: number;
  groupA: ScoreGroupBucket;
  groupB: ScoreGroupBucket;
  scoreDiff: number;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function summarizeBucket(
  label: string,
  targetGroupNumber: GroupNumber,
  students: Student[]
): ScoreGroupBucket {
  const totalScore = Number(students.reduce((acc, s) => acc + (Number(s.score) || 0), 0).toFixed(1));
  return {
    label,
    targetGroupNumber,
    students,
    count: students.length,
    totalScore,
    avgScore: students.length > 0 ? Number((totalScore / students.length).toFixed(2)) : 0,
  };
}

/**
 * Chia 1 Tổ thành 2 Nhóm ngẫu nhiên sao cho:
 * 1) Sĩ số 2 nhóm chênh nhau tối đa 1 học sinh
 * 2) Tổng điểm đánh giá (thang 1-10) của 2 nhóm gần như bằng nhau nhất
 * 3) Mỗi lần nhấn nút Random vẫn sinh ra tổ hợp mới ngẫu nhiên trong nhóm các phương án tối ưu.
 */
export function splitToIntoTwoEqualSumGroups(
  toNumber: number,
  studentsInTo: Student[]
): TwoGroupScoreSplitResult {
  const groupANum = Math.min(8, Math.max(1, (toNumber - 1) * 2 + 1)) as GroupNumber;
  const groupBNum = Math.min(8, Math.max(1, (toNumber - 1) * 2 + 2)) as GroupNumber;

  if (studentsInTo.length <= 1) {
    const bucketA = summarizeBucket(`Nhóm ${groupANum}`, groupANum, [...studentsInTo]);
    const bucketB = summarizeBucket(`Nhóm ${groupBNum}`, groupBNum, []);
    return {
      to: toNumber,
      groupA: bucketA,
      groupB: bucketB,
      scoreDiff: bucketA.totalScore,
    };
  }

  const targetSizeA = Math.ceil(studentsInTo.length / 2);
  const candidates: Array<{ a: Student[]; b: Student[]; diff: number }> = [];

  const trials = 350;
  for (let t = 0; t < trials; t++) {
    const shuffled = shuffleInPlace(studentsInTo);
    const a: Student[] = shuffled.slice(0, targetSizeA);
    const b: Student[] = shuffled.slice(targetSizeA);

    let sumA = a.reduce((acc, s) => acc + s.score, 0);
    let sumB = b.reduce((acc, s) => acc + s.score, 0);

    // Local 1-for-1 swap optimization to minimize |sumA - sumB|
    let improved = true;
    let guard = 0;
    while (improved && guard < 40) {
      improved = false;
      guard++;
      const currentDiff = Math.abs(sumA - sumB);
      let bestSwap: { i: number; j: number; newDiff: number } | null = null;

      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
          const newSumA = sumA - a[i].score + b[j].score;
          const newSumB = sumB - b[j].score + a[i].score;
          const newDiff = Math.abs(newSumA - newSumB);
          if (newDiff + 1e-6 < currentDiff && (!bestSwap || newDiff < bestSwap.newDiff)) {
            bestSwap = { i, j, newDiff };
          }
        }
      }

      if (bestSwap) {
        const temp = a[bestSwap.i];
        a[bestSwap.i] = b[bestSwap.j];
        b[bestSwap.j] = temp;
        sumA = a.reduce((acc, s) => acc + s.score, 0);
        sumB = b.reduce((acc, s) => acc + s.score, 0);
        improved = true;
      }
    }

    candidates.push({ a, b, diff: Math.abs(sumA - sumB) });
  }

  const minDiff = Math.min(...candidates.map((c) => c.diff));
  // Pick randomly among optimal/near-optimal partitions so repeated clicks stay fresh
  const nearOptimal = candidates.filter((c) => c.diff <= minDiff + 0.5);
  const chosen = nearOptimal[Math.floor(Math.random() * nearOptimal.length)];

  // Randomly swap A/B sides 50% of the time so leaders/students mix evenly across group numbers
  const flip = Math.random() < 0.5;
  const finalA = flip ? chosen.b : chosen.a;
  const finalB = flip ? chosen.a : chosen.b;

  const groupA = summarizeBucket(`Nhóm ${groupANum}`, groupANum, finalA);
  const groupB = summarizeBucket(`Nhóm ${groupBNum}`, groupBNum, finalB);
  const scoreDiff = Number(Math.abs(groupA.totalScore - groupB.totalScore).toFixed(1));

  return { to: toNumber, groupA, groupB, scoreDiff };
}

/**
 * Tự động phát thẻ ngẫu nhiên cho 8 nhóm theo cấu hình số lượng từng nhiệm vụ (cho phép trùng 2 hoặc 3 nhóm).
 */
export function autoDealMissionCards(
  coreMissions: CoreMission[],
  config: MissionAllocationConfig
): Record<GroupNumber, string[]> {
  // Build card pool based on missionCounts (1..5)
  const pool: Array<{ cardId: string; missionId: number }> = [];

  for (const mission of coreMissions) {
    const desiredCount = Math.max(0, Number(config.missionCounts[mission.id] ?? 0));
    if (desiredCount === 0 || mission.cards.length === 0) continue;
    for (let i = 0; i < desiredCount; i++) {
      const card = mission.cards[i % mission.cards.length];
      pool.push({ cardId: card.id, missionId: mission.id });
    }
  }

  const fallbackAllCards = coreMissions.flatMap((m) =>
    m.cards.map((c) => ({ cardId: c.id, missionId: m.id }))
  );

  let workingPool = shuffleInPlace(pool);
  const result: Record<GroupNumber, string[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
    8: [],
  };

  for (const g of GROUP_NUMBERS) {
    const needed = Math.max(0, Number(config.cardsPerGroup[g] ?? 1));
    const usedMissions = new Set<number>();

    for (let k = 0; k < needed; k++) {
      if (workingPool.length === 0) {
        workingPool = shuffleInPlace(pool.length > 0 ? pool : fallbackAllCards);
      }
      if (workingPool.length === 0) break;

      let pickIdx = 0;
      if (!config.allowRepeatSameGroup) {
        const distinctIdx = workingPool.findIndex((item) => !usedMissions.has(item.missionId));
        if (distinctIdx !== -1) pickIdx = distinctIdx;
      }

      const [picked] = workingPool.splice(pickIdx, 1);
      if (picked) {
        result[g].push(picked.cardId);
        usedMissions.add(picked.missionId);
      }
    }
  }

  return result;
}
