import { useEffect, useMemo, useState } from 'react';

type SalaryForm = {
  monthlySalary: number;
  workDaysPerMonth: number;
  workHoursPerDay: number;
  workStartHour: number;
  workEndHour: number;
};

const STORAGE_KEY = 'balance-salary-form';

const defaultForm: SalaryForm = {
  monthlySalary: 12000,
  workDaysPerMonth: 22,
  workHoursPerDay: 8,
  workStartHour: 9,
  workEndHour: 18,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 6,
  }).format(value);
}

function formatPlain(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 6,
  }).format(value);
}

function getWorkProgress(startHour: number, endHour: number) {
  const now = new Date();
  const current = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const progress = (current - startHour) / Math.max(1, endHour - startHour);
  return clamp(progress, 0, 1);
}

export default function App() {
  const [form, setForm] = useState<SalaryForm>(defaultForm);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setForm({ ...defaultForm, ...JSON.parse(stored) });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(() => {
    const daily = form.monthlySalary / form.workDaysPerMonth;
    const hourly = daily / form.workHoursPerDay;
    const minute = hourly / 60;
    const second = minute / 60;
    const millisecond = second / 1000;

    const progress = getWorkProgress(form.workStartHour, form.workEndHour);
    const todayEarned = daily * progress;
    const earnedThisHour = hourly * (now.getMinutes() / 60 + now.getSeconds() / 3600);
    const earnedThisMinute = minute * now.getSeconds();

    return {
      daily,
      hourly,
      minute,
      second,
      millisecond,
      progress,
      todayEarned,
      earnedThisHour,
      earnedThisMinute,
    };
  }, [form, now]);

  const prompts = [
    '你的时间正在变现。',
    '每一秒都值得被看见。',
    '专注一点，收入就更具体。',
    '别低估此刻的价值。',
  ];
  const prompt = prompts[now.getSeconds() % prompts.length];

  return (
    <div className="app-shell">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />

      <main className="phone-frame">
        <section className="hero-card glass">
          <div className="hero-top">
            <span className="badge">AI-ui · 实时收入仪表盘</span>
            <span className="muted">{now.toLocaleTimeString('zh-CN')}</span>
          </div>

          <div className="hero-amount">
            <div className="label">今日已赚</div>
            <div className="amount">{formatCurrency(metrics.todayEarned)}</div>
            <div className="subline">每秒约 {formatPlain(metrics.second)} 元 · 每毫秒约 {formatPlain(metrics.millisecond)} 元</div>
          </div>

          <div className="progress-wrap">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${metrics.progress * 100}%` }} />
            </div>
            <div className="progress-meta">
              <span>今日工作进度</span>
              <span>{Math.round(metrics.progress * 100)}%</span>
            </div>
          </div>
        </section>

        <section className="grid-2">
          {[
            ['日薪', formatCurrency(metrics.daily)],
            ['时薪', formatCurrency(metrics.hourly)],
            ['分钟', formatPlain(metrics.minute)],
            ['秒钟', formatPlain(metrics.second)],
          ].map(([title, value]) => (
            <article className="metric-card glass" key={title}>
              <span className="metric-title">{title}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <section className="glass settings-card">
          <div className="section-title">工资设置</div>
          <div className="form-grid">
            <label>
              <span>月工资</span>
              <input
                type="number"
                min="0"
                value={form.monthlySalary}
                onChange={(e) => setForm((prev) => ({ ...prev, monthlySalary: Number(e.target.value) }))}
              />
            </label>
            <label>
              <span>每月工作天数</span>
              <input
                type="number"
                min="1"
                value={form.workDaysPerMonth}
                onChange={(e) => setForm((prev) => ({ ...prev, workDaysPerMonth: Number(e.target.value) }))}
              />
            </label>
            <label>
              <span>每天工作小时</span>
              <input
                type="number"
                min="1"
                value={form.workHoursPerDay}
                onChange={(e) => setForm((prev) => ({ ...prev, workHoursPerDay: Number(e.target.value) }))}
              />
            </label>
            <label>
              <span>上班时间</span>
              <input
                type="number"
                min="0"
                max="23"
                value={form.workStartHour}
                onChange={(e) => setForm((prev) => ({ ...prev, workStartHour: Number(e.target.value) }))}
              />
            </label>
            <label>
              <span>下班时间</span>
              <input
                type="number"
                min="0"
                max="23"
                value={form.workEndHour}
                onChange={(e) => setForm((prev) => ({ ...prev, workEndHour: Number(e.target.value) }))}
              />
            </label>
          </div>
          <p className="hint">{prompt}</p>
        </section>
      </main>
    </div>
  );
}
