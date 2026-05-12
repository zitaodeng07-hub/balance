export type SalaryMode = 'gross' | 'net' | 'china-tax';
export type PayMode = 'calendar' | 'work';
export type CurrencyCode = 'CNY' | 'USD';

export type SalaryProfile = {
  monthlySalary: number;
  mode: SalaryMode;
  currency: CurrencyCode;
  deductionRate: number;
  fixedDeduction: number;
  socialInsurance: number;
  specialAdditionalDeduction: number;
  taxMonth: number;
  payMode: PayMode;
  workdays: number[];
  workdayStartHour: number;
  workdayEndHour: number;
  lunchStartHour: number;
  lunchEndHour: number;
};

export type SalaryMetrics = {
  effectiveSalary: number;
  totalPayableMilliseconds: number;
  elapsedPayableMilliseconds: number;
  millisecondIncome: number;
  secondIncome: number;
  minuteIncome: number;
  hourIncome: number;
  dayIncome: number;
  earnedToday: number;
  earnedThisMonth: number;
  projectedMonth: number;
  progress: number;
  workdayCount: number;
  daysInMonth: number;
  currentTimeLabel: string;
  tax: TaxBreakdown;
};

export type TaxBreakdown = {
  monthlyTax: number;
  monthlyDeductions: number;
  cumulativeTaxableIncome: number;
  cumulativeTax: number;
  rate: number;
  quickDeduction: number;
};

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * HOURS_PER_DAY;
const CHINA_MONTHLY_BASIC_DEDUCTION = 5000;

const chinaAnnualTaxBrackets = [
  { limit: 36000, rate: 0.03, quickDeduction: 0 },
  { limit: 144000, rate: 0.1, quickDeduction: 2520 },
  { limit: 300000, rate: 0.2, quickDeduction: 16920 },
  { limit: 420000, rate: 0.25, quickDeduction: 31920 },
  { limit: 660000, rate: 0.3, quickDeduction: 52920 },
  { limit: 960000, rate: 0.35, quickDeduction: 85920 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 181920 },
];

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function dateAtHour(base: Date, hour: number) {
  const wholeHour = Math.floor(hour);
  const minutes = Math.round((hour - wholeHour) * MINUTES_PER_HOUR);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), wholeHour, minutes, 0, 0);
}

function getMonthStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthEnd(now: Date) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

function getDayRange(day: Date, profile: SalaryProfile) {
  const start = dateAtHour(day, profile.workdayStartHour);
  const end = dateAtHour(day, profile.workdayEndHour);
  return end > start ? { start, end } : { start, end: new Date(end.getTime() + MILLISECONDS_PER_DAY) };
}

function overlapMilliseconds(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  return Math.max(0, Math.min(end.getTime(), rangeEnd.getTime()) - Math.max(start.getTime(), rangeStart.getTime()));
}

export function normalizeSalaryProfile(profile: SalaryProfile): SalaryProfile {
  const start = clamp(Number.isFinite(profile.workdayStartHour) ? profile.workdayStartHour : 9, 0, 23.75);
  const end = clamp(Number.isFinite(profile.workdayEndHour) ? profile.workdayEndHour : 18, 0.25, 24);
  const lunchStart = clamp(Number.isFinite(profile.lunchStartHour) ? profile.lunchStartHour : 12, 0, 23.75);
  const lunchEnd = clamp(Number.isFinite(profile.lunchEndHour) ? profile.lunchEndHour : 13, 0.25, 24);
  const workdays = profile.workdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return {
    monthlySalary: Number.isFinite(profile.monthlySalary) ? Math.max(profile.monthlySalary, 0) : 0,
    mode: profile.mode === 'net' || profile.mode === 'china-tax' ? profile.mode : 'gross',
    currency: profile.currency === 'USD' ? 'USD' : 'CNY',
    deductionRate: clamp(Number.isFinite(profile.deductionRate) ? profile.deductionRate : 0, 0, 80),
    fixedDeduction: Number.isFinite(profile.fixedDeduction) ? Math.max(profile.fixedDeduction, 0) : 0,
    socialInsurance: Number.isFinite(profile.socialInsurance) ? Math.max(profile.socialInsurance, 0) : 0,
    specialAdditionalDeduction: Number.isFinite(profile.specialAdditionalDeduction) ? Math.max(profile.specialAdditionalDeduction, 0) : 0,
    taxMonth: clamp(Math.round(profile.taxMonth) || new Date().getMonth() + 1, 1, 12),
    payMode: profile.payMode === 'calendar' ? 'calendar' : 'work',
    workdays: workdays.length > 0 ? [...new Set(workdays)] : [1, 2, 3, 4, 5],
    workdayStartHour: start,
    workdayEndHour: Math.max(end, start + 0.25),
    lunchStartHour: lunchStart,
    lunchEndHour: Math.max(lunchEnd, lunchStart),
  };
}

function getChinaTaxBracket(taxableIncome: number) {
  return chinaAnnualTaxBrackets.find((bracket) => taxableIncome <= bracket.limit) ?? chinaAnnualTaxBrackets[chinaAnnualTaxBrackets.length - 1];
}

function calculateChinaMonthlyTax(profile: SalaryProfile): TaxBreakdown {
  const month = clamp(Math.round(profile.taxMonth) || 1, 1, 12);
  const monthlyDeductions = profile.socialInsurance + profile.specialAdditionalDeduction;
  const cumulativeTaxableIncome = Math.max(
    profile.monthlySalary * month - CHINA_MONTHLY_BASIC_DEDUCTION * month - monthlyDeductions * month,
    0,
  );
  const previousTaxableIncome = Math.max(
    profile.monthlySalary * (month - 1) - CHINA_MONTHLY_BASIC_DEDUCTION * (month - 1) - monthlyDeductions * (month - 1),
    0,
  );
  const bracket = getChinaTaxBracket(cumulativeTaxableIncome);
  const previousBracket = getChinaTaxBracket(previousTaxableIncome);
  const cumulativeTax = Math.max(cumulativeTaxableIncome * bracket.rate - bracket.quickDeduction, 0);
  const previousTax = Math.max(previousTaxableIncome * previousBracket.rate - previousBracket.quickDeduction, 0);

  return {
    monthlyTax: Math.max(cumulativeTax - previousTax, 0),
    monthlyDeductions,
    cumulativeTaxableIncome,
    cumulativeTax,
    rate: bracket.rate,
    quickDeduction: bracket.quickDeduction,
  };
}

function getNetSalary(profile: SalaryProfile, tax: TaxBreakdown) {
  if (profile.mode === 'net') {
    return profile.monthlySalary;
  }

  if (profile.mode === 'china-tax') {
    return Math.max(profile.monthlySalary - tax.monthlyDeductions - tax.monthlyTax, 0);
  }

  return Math.max(profile.monthlySalary * (1 - profile.deductionRate / 100) - profile.fixedDeduction, 0);
}

function getPayableMillisecondsForDay(day: Date, profile: SalaryProfile, until?: Date) {
  if (!profile.workdays.includes(day.getDay())) {
    return 0;
  }

  const { start, end } = getDayRange(day, profile);
  const cappedEnd = until && until < end ? until : end;
  const workMilliseconds = overlapMilliseconds(start, end, start, cappedEnd);
  const lunchStart = dateAtHour(day, profile.lunchStartHour);
  const lunchEnd = dateAtHour(day, profile.lunchEndHour);
  const lunchMilliseconds = overlapMilliseconds(lunchStart, lunchEnd, start, cappedEnd);

  return Math.max(workMilliseconds - lunchMilliseconds, 0);
}

function getWorkModeStats(profile: SalaryProfile, now: Date) {
  const monthStart = getMonthStart(now);
  const monthEnd = getMonthEnd(now);
  let totalPayableMilliseconds = 0;
  let elapsedPayableMilliseconds = 0;
  let todayPayableMilliseconds = 0;
  let elapsedTodayMilliseconds = 0;
  let workdayCount = 0;

  for (let day = new Date(monthStart); day < monthEnd; day.setDate(day.getDate() + 1)) {
    const cursor = new Date(day);
    const dayTotal = getPayableMillisecondsForDay(cursor, profile);

    if (dayTotal > 0) {
      workdayCount += 1;
    }

    totalPayableMilliseconds += dayTotal;

    if (cursor < now) {
      elapsedPayableMilliseconds += getPayableMillisecondsForDay(cursor, profile, now);
    }

    if (
      cursor.getFullYear() === now.getFullYear() &&
      cursor.getMonth() === now.getMonth() &&
      cursor.getDate() === now.getDate()
    ) {
      todayPayableMilliseconds = dayTotal;
      elapsedTodayMilliseconds = getPayableMillisecondsForDay(cursor, profile, now);
    }
  }

  return { totalPayableMilliseconds, elapsedPayableMilliseconds, todayPayableMilliseconds, elapsedTodayMilliseconds, workdayCount };
}

export function getSalaryMetrics(profileInput: SalaryProfile, now = new Date()): SalaryMetrics {
  const profile = normalizeSalaryProfile(profileInput);
  const tax = calculateChinaMonthlyTax(profile);
  const effectiveSalary = getNetSalary(profile, tax);
  const monthStart = getMonthStart(now);
  const monthEnd = getMonthEnd(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const calendarTotal = monthEnd.getTime() - monthStart.getTime();
  const calendarElapsed = clamp(now.getTime() - monthStart.getTime(), 0, calendarTotal);

  const workStats = getWorkModeStats(profile, now);
  const totalPayableMilliseconds = profile.payMode === 'calendar' ? calendarTotal : Math.max(workStats.totalPayableMilliseconds, 1);
  const elapsedPayableMilliseconds = profile.payMode === 'calendar' ? calendarElapsed : workStats.elapsedPayableMilliseconds;
  const millisecondIncome = totalPayableMilliseconds > 0 ? effectiveSalary / totalPayableMilliseconds : 0;
  const todayElapsed = profile.payMode === 'calendar'
    ? now.getHours() * MILLISECONDS_PER_HOUR + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds()
    : workStats.elapsedTodayMilliseconds;
  const todayTotal = profile.payMode === 'calendar' ? MILLISECONDS_PER_DAY : Math.max(workStats.todayPayableMilliseconds, 1);

  return {
    effectiveSalary,
    totalPayableMilliseconds,
    elapsedPayableMilliseconds,
    millisecondIncome,
    secondIncome: millisecondIncome * MILLISECONDS_PER_SECOND,
    minuteIncome: millisecondIncome * MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE,
    hourIncome: millisecondIncome * MILLISECONDS_PER_HOUR,
    dayIncome: effectiveSalary / daysInMonth,
    earnedToday: todayElapsed * millisecondIncome,
    earnedThisMonth: elapsedPayableMilliseconds * millisecondIncome,
    projectedMonth: effectiveSalary,
    progress: clamp(todayElapsed / todayTotal, 0, 1),
    workdayCount: profile.payMode === 'calendar' ? daysInMonth : workStats.workdayCount,
    daysInMonth,
    currentTimeLabel: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`,
    tax,
  };
}
