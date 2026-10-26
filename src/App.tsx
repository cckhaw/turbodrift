import { useCallback, useMemo, useState } from 'react';
import Menu from './components/Menu';
import RaceScreen from './components/RaceScreen';
import Results from './components/Results';
import LeaderboardModal from './components/LeaderboardModal';
import { synth } from './audio/synth';
import { WORLDS } from './game/worlds';
import type { RaceResult } from './game/types';
import { getPlayerName, saveScore } from './utils/leaderboard';
import { hapticsEnabled, setHaptics } from './utils/haptics';
import { loadProgress, recordFinish, type Progress } from './utils/progress';
import { randomSeed } from './utils/rng';

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
  const [runId, setRunId] = useState(0);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [unlock, setUnlock] = useState<number | null>(null);
  const [board, setBoard] = useState(false);
  const [muted, setMuted] = useState(false);
  const [haptics, setHapticsState] = useState(hapticsEnabled);

  const pickWorld = (w: number) => {
    setWorld(w);
    syncUrl(w, seed);
  };
  const pickSeed = (s: number) => {
    setSeed(s);
    setFromLink(false);
    syncUrl(world, s);
  };

  const race = () => {
    synth.init(); // needs a user gesture
    setResult(null);
    setUnlock(null);
    setRunId((n) => n + 1);
    setScreen('race');
  };

  const finish = useCallback((r: RaceResult) => {
    const before = loadProgress().unlocked;
    const next = recordFinish(r.world, r.position);
    setProgress(next);
    setUnlock(next.unlocked > before ? next.unlocked : null);
    void saveScore({ name: getPlayerName(), lapMs: r.bestLap, totalMs: r.totalTime, world: r.world, seed: r.seed });
    setResult(r);
    setScreen('results');
  }, []);

  const quit = () => {
    synth.stopMusic();
    setScreen('menu');
  };

  return (
    <div className="h-full w-full">
      {screen === 'menu' && (
        <Menu
          world={world}
          seed={seed}
          fromLink={fromLink}
          progress={progress}
          muted={muted}
          haptics={haptics}
          onHaptics={() => {
            setHaptics(!haptics);
            setHapticsState(!haptics);
          }}
          onWorld={pickWorld}
          onSeed={pickSeed}
          onRace={race}
          onBoard={() => setBoard(true)}
          onMute={() => {
            synth.init();
            synth.setMuted(!muted);
            setMuted(!muted);
          }}
        />
      )}
      {screen !== 'menu' && <RaceScreen key={runId} world={world} seed={seed} onFinish={finish} onQuit={quit} />}
      {screen === 'results' && result && (
        <Results
          result={result}
          newUnlock={unlock}
          onAgain={race}
          onMenu={quit}
          onBoard={() => setBoard(true)}
          onNext={
            result.position <= 3 && world < WORLDS.length
              ? () => {
                  const w = world + 1;
                  const s = randomSeed();
                  setWorld(w);
                  setSeed(s);
                  setFromLink(false);
                  syncUrl(w, s);
                  setTimeout(race, 0);
                }
              : null
          }
        />
      )}
      {board && <LeaderboardModal world={world} seed={seed} last={result} onClose={() => setBoard(false)} />}
    </div>
  );
}
