import type { GroupNumber, SeedLevel, Student } from '../../shared/types.ts';

export interface SplitBucketSummary {
  label: string;
  students: Student[];
  count: number;
  avgSeed: number;
  seedCounts: Record<SeedLevel, number>;
}

export interface TwoGroupSplitResult {
  to: number;
  groupA: SplitBucketSummary;
  groupB: SplitBucketSummary;
  seedDiff: number;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function summarizeBucket(label: string, students: Student[]): SplitBucketSummary {
  const seedCounts: Record<SeedLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalSeed = 0;
  for (const s of students) {
    seedCounts[s.seed] = (seedCounts[s.seed] || 0) + 1;
    totalSeed += s.seed;
  }
  return {
    label,
    students,
    count: students.length,
    avgSeed: students.length > 0 ? Number((totalSeed / students.length).toFixed(2)) : 0,
    seedCounts,
  };
}

/**
 * Chia 1 Tổ thành 2 Nhóm bằng thuật toán Random phân tầng theo Hạt giống (1 = Cao nhất -> 5 = Thấp nhất).
 * Trong từng mức hạt giống, danh sách được xáo trộn ngẫu nhiên rồi phân bổ cân bằng số lượng và tổng trọng số năng lực.
 */
export function splitToIntoTwoBalancedGroups(toNumber: number, studentsInTo: Student[]): TwoGroupSplitResult {
  const tiers: SeedLevel[] = [1, 2, 3, 4, 5];
  const orderedStratified: Student[] = [];

  for (const tier of tiers) {
    const inTier = studentsInTo.filter((s) => s.seed === tier);
    orderedStratified.push(...shuffleInPlace(inTier));
  }

  const bucketA: Student[] = [];
  const bucketB: Student[] = [];
  let sumA = 0;
  let sumB = 0;

  orderedStratified.forEach((student, idx) => {
    if (bucketA.length < bucketB.length) {
      bucketA.push(student);
      sumA += student.seed;
    } else if (bucketB.length < bucketA.length) {
      bucketB.push(student);
      sumB += student.seed;
    } else {
      // Equal count: give to the bucket with higher seed sum (weaker average), or alternate randomly on tie
      if (sumA > sumB) {
        bucketA.push(student);
        sumA += student.seed;
      } else if (sumB > sumA) {
        bucketB.push(student);
        sumB += student.seed;
      } else {
        if ((idx + Math.round(Math.random())) % 2 === 0) {
          bucketA.push(student);
          sumA += student.seed;
        } else {
          bucketB.push(student);
          sumB += student.seed;
        }
      }
    }
  });

  const groupA = summarizeBucket(`Tổ ${toNumber} — Nhóm A`, bucketA);
  const groupB = summarizeBucket(`Tổ ${toNumber} — Nhóm B`, bucketB);
  const seedDiff = Number(Math.abs(groupA.avgSeed - groupB.avgSeed).toFixed(2));

  return { to: toNumber, groupA, groupB, seedDiff };
}

/**
 * Chia toàn bộ học sinh trong lớp vào 5 nhóm (1..5) cân bằng theo hạt giống năng lực.
 */
export function distributeClassIntoFiveBalancedGroups(
  students: Student[]
): Record<GroupNumber, SplitBucketSummary> {
  const tiers: SeedLevel[] = [1, 2, 3, 4, 5];
  const ordered: Student[] = [];
  for (const tier of tiers) {
    ordered.push(...shuffleInPlace(students.filter((s) => s.seed === tier)));
  }

  const buckets: Record<GroupNumber, Student[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const sums: Record<GroupNumber, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const groupNums: GroupNumber[] = [1, 2, 3, 4, 5];

  for (const student of ordered) {
    // Pick group with fewest students first, tie-break by highest seed sum (needs stronger balance)
    const sortedTargets = [...groupNums].sort((a, b) => {
      if (buckets[a].length !== buckets[b].length) {
        return buckets[a].length - buckets[b].length;
      }
      return sums[b] - sums[a];
    });
    const chosen = sortedTargets[0];
    buckets[chosen].push(student);
    sums[chosen] += student.seed;
  }

  return {
    1: summarizeBucket('Nhóm 1', buckets[1]),
    2: summarizeBucket('Nhóm 2', buckets[2]),
    3: summarizeBucket('Nhóm 3', buckets[3]),
    4: summarizeBucket('Nhóm 4', buckets[4]),
    5: summarizeBucket('Nhóm 5', buckets[5]),
  };
}
