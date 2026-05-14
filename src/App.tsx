import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSalaryMetrics, type CurrencyCode, type PayMode, type SalaryMode, type SalaryProfile } from './salary';
import { isSupabaseConfigured, supabase } from './supabase';

type Theme = 'minimal' | 'neon' | 'glass';
type Coin = { id: number; left: number; delay: number; size: number; drift: number };
type CoinAudioContext = AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }

  interface Navigator {
    standalone?: boolean;
  }
}

const STORAGE_KEY = 'balance-salary-profile-v2';
const SESSION_KEY = 'balance-session-state-v2';
const PREFERENCES_KEY = 'balance-preferences-v1';
const DISPLAY_DIGITS = 3;
const COIN_STEP = 0.02;
const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

const defaultProfile: SalaryProfile = {
  monthlySalary: 15000,
  mode: 'gross',
  currency: 'CNY',
  deductionRate: 18,
  fixedDeduction: 0,
  socialInsurance: 2500,
  specialAdditionalDeduction: 0,
  taxMonth: new Date().getMonth() + 1,
  payMode: 'work',
  workdays: [1, 2, 3, 4, 5],
  workdayStartHour: 9.5,
  workdayEndHour: 18.5,
  lunchStartHour: 12.5,
  lunchEndHour: 13.5,
};

const themeMeta: Record<Theme, { title: string; subtitle: string }> = {
  minimal: { title: '极简', subtitle: '低干扰专注界面' },
  neon: { title: '霓虹', subtitle: '实时收入流动感' },
  glass: { title: '琉璃', subtitle: '轻量玻璃质感' },
};

function readStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional; Safari private mode can reject writes.
  }
}

function removeStoredValue(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function formatCurrency(value: number, currency: CurrencyCode, digits = 2) {
  const symbol = currency === 'USD' ? '$' : '¥';
  const safeValue = Number.isFinite(value) ? value : 0;

  try {
    if ('Intl' in window && Intl.NumberFormat) {
      return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(safeValue);
    }
  } catch {
    // Older iOS WebViews can have partial Intl support; fall back to a plain formatter.
  }

  return `${symbol}${safeValue.toFixed(digits)}`;
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toHourInput(value: number) {
  const hour = Math.floor(value);
  const minutes = Math.round((value - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function fromHourInput(value: string) {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) + Number(minute) / 60;
}

function getAuthRedirectUrl() {
  return new URL('./', window.location.href).href;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BalanceApp />
    </AppErrorBoundary>
  );
}

function BalanceApp() {
  const [profile, setProfile] = useState<SalaryProfile>(defaultProfile);
  const [theme, setTheme] = useState<Theme>('neon');
  const [now, setNow] = useState(() => new Date());
  const [isRunning, setIsRunning] = useState(true);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [silentMode, setSilentMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const lastCoinStepRef = useRef(0);
  const coinIdRef = useRef(0);
  const audioContextRef = useRef<CoinAudioContext | null>(null);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

    const stored = readStoredValue(STORAGE_KEY);
    const session = readStoredValue(SESSION_KEY);
    const preferences = readStoredValue(PREFERENCES_KEY);

    if (stored) {
      try {
        setProfile((current) => ({ ...current, ...JSON.parse(stored) }));
      } catch {
        removeStoredValue(STORAGE_KEY);
      }
    }

    if (session) {
      try {
        const parsed = JSON.parse(session) as Partial<{ theme: Theme; isRunning: boolean; sessionStartedAt: number; pausedElapsed: number }>;
        if (parsed.theme) setTheme(parsed.theme);
        if (typeof parsed.isRunning === 'boolean') setIsRunning(parsed.isRunning);
        if (typeof parsed.sessionStartedAt === 'number') setSessionStartedAt(parsed.sessionStartedAt);
        if (typeof parsed.pausedElapsed === 'number') setPausedElapsed(parsed.pausedElapsed);
      } catch {
        removeStoredValue(SESSION_KEY);
      }
    }

    if (preferences) {
      try {
        const parsed = JSON.parse(preferences) as Partial<{ soundEnabled: boolean; silentMode: boolean; hasSeenOnboarding: boolean }>;
        if (typeof parsed.soundEnabled === 'boolean') setSoundEnabled(parsed.soundEnabled);
        if (typeof parsed.silentMode === 'boolean') setSilentMode(parsed.silentMode);
        setShowOnboarding(parsed.hasSeenOnboarding !== true);
      } catch {
        removeStoredValue(PREFERENCES_KEY);
        setShowOnboarding(true);
      }
    } else {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    writeStoredValue(STORAGE_KEY, profile);
  }, [profile]);

  useEffect(() => {
    writeStoredValue(SESSION_KEY, { theme, isRunning, sessionStartedAt, pausedElapsed });
  }, [theme, isRunning, sessionStartedAt, pausedElapsed]);

  useEffect(() => {
    writeStoredValue(PREFERENCES_KEY, { soundEnabled, silentMode, hasSeenOnboarding: !showOnboarding });
  }, [soundEnabled, silentMode, showOnboarding]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), isRunning ? 50 : 500);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthReady(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      setAuthMessage('');
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextCtor || audioContextRef.current) {
        return;
      }

      audioContextRef.current = new AudioContextCtor();
      void audioContextRef.current.resume();
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const metrics = useMemo(() => getSalaryMetrics(profile, now), [now, profile]);
  const canUseApp = !isSupabaseConfigured || Boolean(session);
  const sessionElapsed = canUseApp && isRunning ? pausedElapsed + Date.now() - sessionStartedAt : pausedElapsed;
  const sessionIncome = sessionElapsed * metrics.millisecondIncome;
  const coffeeMinutes = Math.max(Math.ceil(18 / Math.max(metrics.minuteIncome, 0.0001)), 1);
  const nextMilestone = Math.ceil(metrics.earnedToday / 50) * 50 + 50;
  const milestoneGap = Math.max(nextMilestone - metrics.earnedToday, 0);
  const milestoneMinutes = Math.max(Math.ceil(milestoneGap / Math.max(metrics.minuteIncome, 0.0001)), 1);

  useEffect(() => {
    if (!canUseApp || !isRunning || sessionIncome <= 0) {
      return;
    }

    const currentStep = Math.floor(sessionIncome / COIN_STEP);
    if (currentStep <= lastCoinStepRef.current) {
      return;
    }

    lastCoinStepRef.current = currentStep;
    const nextCoin: Coin = {
      id: coinIdRef.current += 1,
      left: 14 + Math.random() * 72,
      delay: Math.random() * 0.12,
      size: 16 + Math.random() * 8,
      drift: -28 + Math.random() * 56,
    };

    playCoinSound(false);
    setCoins((current) => [...current.slice(-8), nextCoin]);
    window.setTimeout(() => {
      setCoins((current) => current.filter((coin) => coin.id !== nextCoin.id));
    }, 2200);
  }, [canUseApp, isRunning, sessionIncome]);

  function toggleRunning() {
    if (isRunning) {
      setPausedElapsed((current) => current + Date.now() - sessionStartedAt);
      setIsRunning(false);
      return;
    }

    setSessionStartedAt(Date.now());
    setIsRunning(true);
  }

  function resetSession() {
    setPausedElapsed(0);
    setSessionStartedAt(Date.now());
    lastCoinStepRef.current = 0;
    setCoins([]);
    setIsRunning(true);
  }

  function getAudioContext() {
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;

    return context;
  }

  function playCoinSound(force = false) {
    if ((!soundEnabled && !force) || silentMode) {
      return;
    }

    const context = getAudioContext();
    if (!context) {
      return;
    }

    if (context.state === 'suspended') {
      void context.resume();
    }

    const nowTime = context.currentTime;
    const master = context.createGain();
    const filter = context.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(900, nowTime);
    master.gain.setValueAtTime(force ? 0.16 : 0.1, nowTime);
    filter.connect(master);
    master.connect(context.destination);

    [0, 0.055, 0.115].forEach((offset, index) => {
      const strikeTime = nowTime + offset;
      const strikeGain = context.createGain();
      const tone = context.createOscillator();
      const overtone = context.createOscillator();

      strikeGain.gain.setValueAtTime(0.0001, strikeTime);
      strikeGain.gain.exponentialRampToValueAtTime((force ? 0.22 : 0.14) / (index + 1), strikeTime + 0.006);
      strikeGain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 0.13);

      tone.type = 'triangle';
      tone.frequency.setValueAtTime(1760 + index * 220, strikeTime);
      tone.frequency.exponentialRampToValueAtTime(1280 + index * 180, strikeTime + 0.12);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(3520 + index * 260, strikeTime + 0.004);
      overtone.frequency.exponentialRampToValueAtTime(2440 + index * 220, strikeTime + 0.11);

      tone.connect(strikeGain);
      overtone.connect(strikeGain);
      strikeGain.connect(filter);
      tone.start(strikeTime);
      overtone.start(strikeTime + 0.004);
      tone.stop(strikeTime + 0.14);
      overtone.stop(strikeTime + 0.13);
    });
  }

  function testCoinSound() {
    setSoundEnabled(true);
    setSilentMode(false);
    playCoinSound(true);
  }

  function setProfileValue<K extends keyof SalaryProfile>(key: K, value: SalaryProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function toggleWorkday(day: number) {
    setProfile((current) => {
      const exists = current.workdays.includes(day);
      const workdays = exists ? current.workdays.filter((item) => item !== day) : [...current.workdays, day].sort();
      return { ...current, workdays: workdays.length > 0 ? workdays : current.workdays };
    });
  }

  function finishOnboarding() {
    setShowOnboarding(false);
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || authBusy) {
      return;
    }

    setAuthBusy(true);
    setAuthMessage('');
    const credentials = { email: authEmail.trim(), password: authPassword };
    const { data, error } = authMode === 'login'
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp({
        ...credentials,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('invalid login credentials')) {
        setAuthMessage('登录失败。请确认已点击最新验证邮件，并重新输入注册时的密码。若是在另一台设备完成验证，请刷新本页后再登录。');
      } else if (message.includes('email not confirmed')) {
        setAuthMessage('请先完成邮箱验证，再登录。');
      } else {
        setAuthMessage(error.message);
      }
    } else if (authMode === 'signup' && data.user?.identities?.length === 0) {
      setAuthMessage('该邮箱已经注册，请切换到登录。');
    } else {
      setAuthMessage(authMode === 'login' ? '登录成功。' : '注册成功。若系统发送验证邮件，请先验证后再登录。');
      setAuthPassword('');
    }
    setAuthBusy(false);
  }

  async function signOut() {
    if (!supabase || authBusy) {
      return;
    }

    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthMessage(error ? error.message : '已退出登录。');
    setAuthBusy(false);
  }

  function clearLocalData() {
    const confirmed = window.confirm('确定清空本地保存的工资、主题、专注状态和偏好吗？此操作不会影响 Supabase 账户。');
    if (!confirmed) {
      return;
    }

    removeStoredValue(STORAGE_KEY);
    removeStoredValue(SESSION_KEY);
    removeStoredValue(PREFERENCES_KEY);
    setProfile(defaultProfile);
    setTheme('neon');
    setIsRunning(true);
    setSessionStartedAt(Date.now());
    setPausedElapsed(0);
    setCoins([]);
    setSoundEnabled(true);
    setSilentMode(false);
    setShowOnboarding(true);
    lastCoinStepRef.current = 0;
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="coin-layer" aria-hidden="true">
        {coins.map((coin) => (
          <span
            key={coin.id}
            className="falling-coin"
            style={{
              left: `${coin.left}%`,
              width: coin.size,
              height: coin.size,
              animationDelay: `${coin.delay}s`,
              '--coin-drift': `${coin.drift}px`,
            } as CSSProperties & Record<'--coin-drift', string>}
          >
            ¥
          </span>
        ))}
      </div>

      <main className="phone-frame">
        <header className="topbar panel">
          <div>
            <p className="eyebrow">Balance</p>
            <h1>收入即时可视化</h1>
          </div>
          <span className="status-pill">{isStandalone ? '主屏幕模式' : 'Safari 模式'}</span>
        </header>

        <section className="auth-panel panel">
          <div className="auth-heading">
            <div>
              <p className="eyebrow">Account</p>
              <h2>Supabase 登录</h2>
            </div>
            <span>{isSupabaseConfigured ? '可用' : '未配置'}</span>
          </div>

          {!isSupabaseConfigured ? (
            <p className="auth-note">配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后启用注册/登录；当前继续使用本地数据。</p>
          ) : !authReady ? (
            <p className="auth-note">正在检查登录状态...</p>
          ) : session ? (
            <div className="auth-signed-in">
              <span>{session.user.email}</span>
              <button className="ghost-action" onClick={signOut} disabled={authBusy}>退出登录</button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <div className="segmented auth-mode">
                <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>登录</button>
                <button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>注册</button>
              </div>
              <input type="email" placeholder="邮箱" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required />
              <input type="password" placeholder="密码（至少 6 位）" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} minLength={6} required />
              <button className="primary-action" disabled={authBusy}>{authBusy ? '处理中...' : authMode === 'login' ? '登录' : '注册'}</button>
            </form>
          )}
          {authMessage && <p className="auth-note">{authMessage}</p>}
        </section>

        {!canUseApp ? (
          <section className="locked-panel panel">
            <p className="eyebrow">Locked</p>
            <h2>请先注册或登录</h2>
            <p>为保护个人收入数据，登录前不能使用实时收入、工资设置和本地数据功能。新用户请先注册，再登录。</p>
          </section>
        ) : (
          <>
            <section className="hero panel">
              <div className="hero-meta">
                <span>本次专注已赚</span>
                <strong>{metrics.currentTimeLabel}</strong>
              </div>
              <div className="money-flow">{formatCurrency(sessionIncome, profile.currency, DISPLAY_DIGITS)}</div>
              <div className="flow-subtitle">
                本次专注 {formatDuration(sessionElapsed)} · 每秒 +{formatCurrency(metrics.secondIncome, profile.currency, DISPLAY_DIGITS)}
              </div>

              <div className="progress-track" aria-label="今日工作进度">
                <div className="progress-fill" style={{ width: `${metrics.progress * 100}%` }} />
              </div>
              <div className="progress-meta">
                <span>{profile.payMode === 'work' ? '工作时段进度' : '自然日进度'}</span>
                <strong>{Math.round(metrics.progress * 100)}%</strong>
              </div>

              <div className="hero-actions">
                <button className="primary-action" onClick={toggleRunning}>{isRunning ? '暂停专注' : '继续专注'}</button>
                <button className="ghost-action" onClick={resetSession}>重置会话</button>
              </div>
            </section>

            {!isStandalone && (
              <section className="install-tip panel">
                <span>想像 App 一样使用？Safari 分享按钮 → 添加到主屏幕。</span>
              </section>
            )}

            <section className="quick-controls panel" aria-label="快捷设置">
              <button className={soundEnabled ? 'active' : ''} onClick={() => setSoundEnabled((current) => !current)}>
                金币音效 {soundEnabled ? '开' : '关'}
              </button>
              <button className={silentMode ? 'active' : ''} onClick={() => setSilentMode((current) => !current)}>
                静音模式 {silentMode ? '开' : '关'}
              </button>
              <button onClick={testCoinSound}>测试音效</button>
            </section>

            <section className="metric-strip">
              <MetricCard label="今日已赚" value={formatCurrency(metrics.earnedToday, profile.currency, DISPLAY_DIGITS)} hint={`进度 ${Math.round(metrics.progress * 100)}%`} />
              <MetricCard label="本月已计" value={formatCurrency(metrics.earnedThisMonth, profile.currency, DISPLAY_DIGITS)} hint={`预计 ${formatCurrency(metrics.projectedMonth, profile.currency, 0)}`} />
              <MetricCard label="时薪" value={formatCurrency(metrics.hourIncome, profile.currency, DISPLAY_DIGITS)} hint={`分钟 ${formatCurrency(metrics.minuteIncome, profile.currency, DISPLAY_DIGITS)}`} />
              <MetricCard label="计薪日" value={`${metrics.workdayCount} 天`} hint={`本月 ${metrics.daysInMonth} 天`} />
            </section>

            <section className="motivation panel">
              <div>
                <p className="eyebrow">轻激励</p>
                <h2>再专注 {coffeeMinutes} 分钟 = 一杯美式</h2>
                <p>距离下一个 {formatCurrency(nextMilestone, profile.currency, 0)} 里程碑，预计还需要 {milestoneMinutes} 分钟。</p>
              </div>
              <div className="chip-row">
                <span>已登录账户</span>
                <span>前台高频刷新</span>
                <span>后台恢复重算</span>
              </div>
            </section>

            <section className="settings panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Settings</p>
              <h2>薪资与工作规则</h2>
            </div>
            <span>{themeMeta[theme].title} · {themeMeta[theme].subtitle}</span>
          </div>

          <div className="form-grid">
            <label>
              <span>月薪</span>
              <input type="number" min="0" value={profile.monthlySalary} onChange={(event) => setProfileValue('monthlySalary', Number(event.target.value) || 0)} />
            </label>

            <label>
              <span>币种</span>
              <select value={profile.currency} onChange={(event) => setProfileValue('currency', event.target.value as CurrencyCode)}>
                <option value="CNY">CNY 人民币</option>
                <option value="USD">USD 美元</option>
              </select>
            </label>

            <Segmented
              label="薪资口径"
              options={[['china-tax', '中国个税'], ['gross', '自定义'], ['net', '税后']]}
              value={profile.mode}
              onChange={(value) => setProfileValue('mode', value as SalaryMode)}
            />

            <Segmented
              label="计薪模式"
              options={[['work', '工作时段'], ['calendar', '自然月']]}
              value={profile.payMode}
              onChange={(value) => setProfileValue('payMode', value as PayMode)}
            />

            {profile.mode === 'gross' && (
              <div className="split-grid">
                <label>
                  <span>扣减比例 {profile.deductionRate}%</span>
                  <input type="range" min="0" max="50" value={profile.deductionRate} onChange={(event) => setProfileValue('deductionRate', Number(event.target.value))} />
                </label>
                <label>
                  <span>固定扣款</span>
                  <input type="number" min="0" value={profile.fixedDeduction} onChange={(event) => setProfileValue('fixedDeduction', Number(event.target.value) || 0)} />
                </label>
              </div>
            )}

            {profile.mode === 'china-tax' && (
              <div className="tax-panel">
                <div className="tax-summary">
                  <span>本月预扣个税</span>
                  <strong>{formatCurrency(metrics.tax.monthlyTax, profile.currency, 2)}</strong>
                  <small>适用税率 {(metrics.tax.rate * 100).toFixed(0)}% · 速算扣除数 {formatCurrency(metrics.tax.quickDeduction, profile.currency, 0)}</small>
                </div>
                <div className="split-grid">
                  <label>
                    <span>计税月份</span>
                    <input type="number" min="1" max="12" value={profile.taxMonth} onChange={(event) => setProfileValue('taxMonth', Number(event.target.value) || 1)} />
                  </label>
                  <label>
                    <span>五险一金等专项扣除</span>
                    <input type="number" min="0" value={profile.socialInsurance} onChange={(event) => setProfileValue('socialInsurance', Number(event.target.value) || 0)} />
                  </label>
                </div>
                <label>
                  <span>专项附加扣除</span>
                  <input type="number" min="0" value={profile.specialAdditionalDeduction} onChange={(event) => setProfileValue('specialAdditionalDeduction', Number(event.target.value) || 0)} />
                </label>
                <p className="tax-note">
                  按居民个人工资薪金累计预扣法估算：累计收入扣除每月 5000 元、专项扣除和专项附加扣除后，套用综合所得年度税率表。未覆盖年终奖、劳务报酬、地区社保基数差异和单位实扣差异。
                </p>
              </div>
            )}

            <div className="weekday-row" aria-label="工作日选择">
              {weekLabels.map((label, index) => (
                <button key={label} className={profile.workdays.includes(index) ? 'active' : ''} onClick={() => toggleWorkday(index)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="split-grid">
              <label>
                <span>上班时间</span>
                <input type="time" value={toHourInput(profile.workdayStartHour)} onChange={(event) => setProfileValue('workdayStartHour', fromHourInput(event.target.value))} />
              </label>
              <label>
                <span>下班时间</span>
                <input type="time" value={toHourInput(profile.workdayEndHour)} onChange={(event) => setProfileValue('workdayEndHour', fromHourInput(event.target.value))} />
              </label>
            </div>

            <div className="split-grid">
              <label>
                <span>午休开始</span>
                <input type="time" value={toHourInput(profile.lunchStartHour)} onChange={(event) => setProfileValue('lunchStartHour', fromHourInput(event.target.value))} />
              </label>
              <label>
                <span>午休结束</span>
                <input type="time" value={toHourInput(profile.lunchEndHour)} onChange={(event) => setProfileValue('lunchEndHour', fromHourInput(event.target.value))} />
              </label>
            </div>

            <Segmented
              label="主题"
              options={[['minimal', '极简'], ['neon', '霓虹'], ['glass', '琉璃']]}
              value={theme}
              onChange={(value) => setTheme(value as Theme)}
            />

            <button className="danger-action" onClick={clearLocalData}>清空本地数据</button>
          </div>
            </section>
          </>
        )}

        <p className="disclaimer">金额仅用于个人收入可视化估算，不替代工资单、税务申报或公司结算结果。</p>
        <a className="debug-link" href="./debug.html">诊断</a>
      </main>

      {canUseApp && showOnboarding && (
        <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
          <section className="onboarding-card panel">
            <p className="eyebrow">首次使用</p>
            <h2 id="onboarding-title">把月薪变成实时反馈</h2>
            <p>输入月薪和工作时间后，首页会显示本次专注已赚、今日已赚和金币反馈。数据只保存在本机浏览器。</p>
            <div className="onboarding-steps">
              <span>1. 设置月薪与税后口径</span>
              <span>2. 点“暂停/继续”控制专注会话</span>
              <span>3. iPhone Safari 可通过分享菜单添加到主屏幕</span>
            </div>
            <button className="primary-action" onClick={finishOnboarding}>开始使用</button>
          </section>
        </div>
      )}
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell theme-neon">
          <main className="phone-frame">
            <section className="panel onboarding-card">
              <p className="eyebrow">启动失败</p>
              <h1>Balance 遇到兼容问题</h1>
              <p className="tax-note">请清理 Safari 网站数据后刷新。如果仍失败，请把下面这行错误发给开发者：</p>
              <p className="tax-note">{this.state.error.message}</p>
            </section>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="metric-card panel">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function Segmented({ label, options, value, onChange }: { label: string; options: readonly [string, string][]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="segmented-field">
      <span>{label}</span>
      <div className="segmented">
        {options.map(([optionValue, optionLabel]) => (
          <button key={optionValue} className={value === optionValue ? 'active' : ''} onClick={() => onChange(optionValue)}>
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
