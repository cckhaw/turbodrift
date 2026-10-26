import { useCallback, useEffect, useMemo, useState } from 'react';
import Menu from './components/Menu';
import RaceScreen from './components/RaceScreen';
import Results from './components/Results';
import LeaderboardModal from './components/LeaderboardModal';
import SettingsModal from './components/SettingsModal';
import HowToPlayModal from './components/HowToPlayModal';
import { synth } from './audio/synth';
import { dailyFor, isDaily as isDailyTrack, recordDaily } from './utils/daily';
import { loadKart, loadMode, saveKart, saveMode, type Mode } from './game/karts';
import { WORLDS } from './game/worlds';
import type { RaceResult } from './game/types';
import { flushPending, getPlayerName, saveScore, watchConnectivity } from './utils/leaderboard';
import { syncCloud } from './utils/cloud';
import { loadProgress, recordFinish, type Progress } from './utils/progress';
import { randomSeed } from './utils/rng';
import { markTutorialSeen, TUTORIAL_SEED, TUTORIAL_WORLD, tutorialSeen } from './utils/tutorial';

type Screen = 'menu' | 'race' | 'results';

function readParams(): { world: number; seed: number; link: boolean } {
  const q = new URLSearchParams(window.location.search);
  const w = parseInt(q.get('world') ?? '', 10);
  const s = parseInt(q.get('seed') ?? '', 10);
  const hasWorld = w >= 1 && w <= WORLDS.length;
  return { world: hasWorld ? w : 1, seed: s > 0 ? s : 98765, link: hasWorld && s > 0 };
}

function syncUrl(world: number, seed: number) {
  const u = new URL(window.location.href);
  u.searchParams.set('world', String(world));
  u.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', u);
}

export default function App() {
  const initial = useMemo(readParams, []);
  const [screen, setScreen] = useState<Screen>('menu');
  const [world, setWorld] = useState(initial.world);
  const [seed, setSeed] = useState(initial.seed);
  const [fromLink, setFromLink] = useState(initial.link);
  const [daily, setDaily] = useState(() => dailyFor());
  const [dailyTick, setDailyTick] = useState(0);
  const [runId, setRunId] = useState(0);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [unlock, setUnlock] = useState<number | null>(null);
  const [board, setBoard] = useState(false);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setModeState] = useState<Mode>(loadMode);
  const [kart, setKartState] = useState(() => loadKart().id);
  const [tutorial, setTutorial] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [offer, setOffer] = useState(false);

  useEffect(() => {
    void flushPending();
    void syncCloud().then((p) => p && setProgress(p));
    const stopWatching = watchConnectivity();
    const t = window.setInterval(() => setDaily(dailyFor()), 60000); // roll over at UTC midnight
    return () => {
      window.clearInterval(t);
      stopWatching();
    };
  }, []);

  const pickWorld = (w: number) => {
    setWorld(w);
    syncUrl(w, seed);
  };
  const pickSeed = (s: number) => {
    setSeed(s);
    setFromLink(false);
    syncUrl(world, s);
  };

  /** Start whatever mode is selected. First-time players get offered the tutorial before their first race. */
  const race = (skipOffer = false) => {
    if (!skipOffer && mode === 'race' && !tutorialSeen()) {
      setOffer(true);
      return;
    }
    if (mode !== 'practice' && !fromLink && world > progress.unlocked) pickWorld(progress.unlocked);
    synth.init(); // needs a user gesture
    setTutorial(false);
    setResult(null);
    setUnlock(null);
    setRunId((n) => n + 1);
    setScreen('race');
  };

  const finish = useCallback((r: RaceResult) => {
    const before = loadProgress().unlocked;
    if (r.mode === 'race') {
      const next = recordFinish(r.world, r.position);
      setProgress(next);
      setUnlock(next.unlocked > before ? next.unlocked : null);
    }
    if (isDailyTrack(dailyFor(), r.world, r.seed)) {
      recordDaily(dailyFor().date);
      setDailyTick((n) => n + 1);
    }
    void syncCloud().then((p) => p && setProgress(p));
    void saveScore({ name: getPlayerName(), lapMs: r.bestLap, totalMs: r.totalTime, world: r.world, seed: r.seed }, r.replay);
    setResult(r);
    setScreen('results');
  }, []);

  const startTutorial = () => {
    synth.init();
    setSettingsOpen(false);
    setHowTo(false);
    setOffer(false);
    setResult(null);
    setUnlock(null);
    setTutorial(true); // endless practice on a fixed easy track, with guided lessons on top
    setRunId((n) => n + 1);
    setScreen('race');
  };

  const startPractice = () => {
    saveMode('practice');
    setModeState('practice');
    setSettingsOpen(false);
    setHowTo(false);
    synth.init();
    setTutorial(false);
    setResult(null);
    setUnlock(null);
    setRunId((n) => n + 1);
    setScreen('race');
  };

  const quit = () => {
    synth.stopMusic();
    setTutorial(false);
    setScreen('menu');
  };

  return (
    <div className="h-full w-full">
      {screen === 'menu' && (
        <Menu
          world={world}
          seed={seed}
          fromLink={fromLink}
          daily={daily}
          dailyTick={dailyTick}
          onDaily={() => {
            const d = dailyFor();
            setWorld(d.world);
            setSeed(d.seed);
            setFromLink(true);
            saveMode('trial');
            setModeState('trial');
            syncUrl(d.world, d.seed);
          }}
          progress={progress}
          muted={muted}
          mode={mode}
          onMode={(m) => {
            saveMode(m);
            setModeState(m);
            // Practice opens every world; leaving it must not strand a locked one for a real race.
            if (m !== 'practice' && !fromLink && world > progress.unlocked) pickWorld(progress.unlocked);
          }}
          kart={kart}
          onKart={(k) => {
            saveKart(k);
            setKartState(k);
          }}
          onSettings={() => setSettingsOpen(true)}
          onHowTo={() => setHowTo(true)}
          onTutorial={startTutorial}
          newPlayer={!tutorialSeen()}
          onWorld={pickWorld}
          onSeed={pickSeed}
          onRace={() => race()}
          onBoard={() => setBoard(true)}
          onMute={() => {
            synth.init();
            synth.setMuted(!muted);
            setMuted(!muted);
          }}
        />
      )}
      {screen !== 'menu' && <RaceScreen key={runId} world={tutorial ? TUTORIAL_WORLD : world} seed={tutorial ? TUTORIAL_SEED : seed} mode={tutorial ? 'practice' : mode} kart={kart} tutorial={tutorial} onFinish={finish} onQuit={quit} onSettings={() => setSettingsOpen(true)} />}
      {screen === 'results' && result && (
        <Results
          result={result}
          newUnlock={unlock}
          onAgain={() => race(true)}
          onMenu={quit}
          onBoard={() => setBoard(true)}
          onNext={
            result.mode === 'race' && result.position <= 3 && world < WORLDS.length
              ? () => {
                  const w = world + 1;
                  const s = randomSeed();
                  setWorld(w);
                  setSeed(s);
                  setFromLink(false);
                  syncUrl(w, s);
                  setTimeout(() => race(true), 0);
                }
              : null
          }
        />
      )}
      {settingsOpen && (
        <SettingsModal
          muted={muted}
          onMute={() => {
            synth.init();
            synth.setMuted(!muted);
            setMuted(!muted);
          }}
          onProgress={setProgress}
          onClose={() => setSettingsOpen(false)}
          onTutorial={startTutorial}
          onHowTo={() => setHowTo(true)}
          onPractice={startPractice}
          inRace={screen !== 'menu'}
        />
      )}
      {howTo && <HowToPlayModal onClose={() => setHowTo(false)} onTutorial={screen === 'menu' ? startTutorial : undefined} onPractice={screen === 'menu' ? startPractice : undefined} />}
      {offer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-label="First race">
          <div className="glass animate-rise w-full max-w-sm space-y-3 p-5 text-center !bg-[rgba(16,22,38,0.92)]">
            <div className="text-4xl">🏎️</div>
            <h2 className="text-xl font-bold tracking-tight">First time here?</h2>
            <p className="text-sm text-white/65">Take a one-minute guided lap to learn steering, drifting, boosting and items. You can replay it any time from Settings.</p>
            <button onClick={startTutorial} className="btn-primary w-full">
              Show me how
            </button>
            <button
              onClick={() => {
                markTutorialSeen('skipped');
                setOffer(false);
                race(true);
              }}
              className="btn-glass w-full"
            >
              Skip, just race
            </button>
          </div>
        </div>
      )}
      {board && <LeaderboardModal world={world} seed={seed} last={result} onClose={() => setBoard(false)} />}
    </div>
  );
}
