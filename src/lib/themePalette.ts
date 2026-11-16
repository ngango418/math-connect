import type { GroupNumber } from '../../shared/types.ts';

export interface GroupTheme {
  number: GroupNumber;
  teamLabel: string;
  gradientHeader: string;
  softBg: string;
  border: string;
  textAccent: string;
  solidButton: string;
  barFill: string;
  badgeText: string;
}

export const GROUP_THEMES: Record<GroupNumber, GroupTheme> = {
  1: {
    number: 1,
    teamLabel: 'Đội Tia Chớp',
    gradientHeader: 'from-sky-500 to-blue-600',
    softBg: 'bg-sky-50/70',
    border: 'border-sky-200',
    textAccent: 'text-sky-700',
    solidButton: 'bg-sky-600 hover:bg-sky-700 text-white',
    barFill: 'bg-sky-500',
    badgeText: 'text-sky-800',
  },
  2: {
    number: 2,
    teamLabel: 'Đội Sao Băng',
    gradientHeader: 'from-violet-500 to-purple-600',
    softBg: 'bg-violet-50/70',
    border: 'border-violet-200',
    textAccent: 'text-violet-700',
    solidButton: 'bg-violet-600 hover:bg-violet-700 text-white',
    barFill: 'bg-violet-500',
    badgeText: 'text-violet-800',
  },
  3: {
    number: 3,
    teamLabel: 'Đội Rừng Xanh',
    gradientHeader: 'from-emerald-500 to-teal-600',
    softBg: 'bg-emerald-50/70',
    border: 'border-emerald-200',
    textAccent: 'text-emerald-700',
    solidButton: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    barFill: 'bg-emerald-500',
    badgeText: 'text-emerald-800',
  },
  4: {
    number: 4,
    teamLabel: 'Đội Mặt Trời',
    gradientHeader: 'from-amber-500 to-orange-500',
    softBg: 'bg-amber-50/70',
    border: 'border-amber-200',
    textAccent: 'text-amber-700',
    solidButton: 'bg-amber-600 hover:bg-amber-700 text-white',
    barFill: 'bg-amber-500',
    badgeText: 'text-amber-800',
  },
  5: {
    number: 5,
    teamLabel: 'Đội San Hô',
    gradientHeader: 'from-rose-500 to-pink-600',
    softBg: 'bg-rose-50/70',
    border: 'border-rose-200',
    textAccent: 'text-rose-700',
    solidButton: 'bg-rose-600 hover:bg-rose-700 text-white',
    barFill: 'bg-rose-500',
    badgeText: 'text-rose-800',
  },
  6: {
    number: 6,
    teamLabel: 'Đội Hải Âu',
    gradientHeader: 'from-indigo-500 to-blue-700',
    softBg: 'bg-indigo-50/70',
    border: 'border-indigo-200',
    textAccent: 'text-indigo-700',
    solidButton: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    barFill: 'bg-indigo-500',
    badgeText: 'text-indigo-800',
  },
  7: {
    number: 7,
    teamLabel: 'Đội Ngọc Bích',
    gradientHeader: 'from-cyan-500 to-teal-600',
    softBg: 'bg-cyan-50/70',
    border: 'border-cyan-200',
    textAccent: 'text-cyan-700',
    solidButton: 'bg-cyan-600 hover:bg-cyan-700 text-white',
    barFill: 'bg-cyan-500',
    badgeText: 'text-cyan-800',
  },
  8: {
    number: 8,
    teamLabel: 'Đội Ngọn Lửa',
    gradientHeader: 'from-orange-500 to-red-500',
    softBg: 'bg-orange-50/70',
    border: 'border-orange-200',
    textAccent: 'text-orange-700',
    solidButton: 'bg-orange-600 hover:bg-orange-700 text-white',
    barFill: 'bg-orange-500',
    badgeText: 'text-orange-800',
  },
};

export interface MissionTheme {
  headerBar: string;
  bg: string;
  border: string;
  text: string;
  ring: string;
}

export const MISSION_THEMES: Record<number, MissionTheme> = {
  1: {
    headerBar: 'from-sky-500 to-blue-500',
    bg: 'bg-sky-50/85',
    border: 'border-sky-200',
    text: 'text-sky-700',
    ring: 'ring-sky-300',
  },
  2: {
    headerBar: 'from-violet-500 to-fuchsia-500',
    bg: 'bg-violet-50/85',
    border: 'border-violet-200',
    text: 'text-violet-700',
    ring: 'ring-violet-300',
  },
  3: {
    headerBar: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50/85',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    ring: 'ring-emerald-300',
  },
  4: {
    headerBar: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50/85',
    border: 'border-amber-200',
    text: 'text-amber-700',
    ring: 'ring-amber-300',
  },
  5: {
    headerBar: 'from-rose-500 to-pink-500',
    bg: 'bg-rose-50/85',
    border: 'border-rose-200',
    text: 'text-rose-700',
    ring: 'ring-rose-300',
  },
};
