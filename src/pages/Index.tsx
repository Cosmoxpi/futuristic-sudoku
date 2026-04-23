import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, RotateCw, Lightbulb, Volume2, VolumeX, Music, Trophy, Sparkles, Zap } from "lucide-react";

type Difficulty = "Easy" | "Medium" | "Hard" | "Expert";
type Phase = "landing" | "difficulty" | "playing" | "complete";
type Cell = { value: number; solution: number; given: boolean; notes: number[] };
type Move = { index: number; previous: number; next: number };
type Score = { difficulty: Difficulty; time: number; mistakes: number; date: string };

const difficulties: Record<Difficulty, number> = { Easy: 38, Medium: 46, Hard: 52, Expert: 58 };
const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

const pattern = (row: number, col: number) => (row * 3 + Math.floor(row / 3) + col) % 9;

const generatePuzzle = (difficulty: Difficulty): Cell[] => {
  const rows = shuffle([0, 1, 2]).flatMap((band) => shuffle([0, 1, 2]).map((row) => band * 3 + row));
  const cols = shuffle([0, 1, 2]).flatMap((stack) => shuffle([0, 1, 2]).map((col) => stack * 3 + col));
  const nums = shuffle(digits);
  const solution = rows.flatMap((row) => cols.map((col) => nums[pattern(row, col)]));
  const hidden = new Set(shuffle(Array.from({ length: 81 }, (_, i) => i)).slice(0, difficulties[difficulty]));

  return solution.map((value, index) => ({
    value: hidden.has(index) ? 0 : value,
    solution: value,
    given: !hidden.has(index),
    notes: [],
  }));
};

const related = (a: number, b: number) => {
  const ar = Math.floor(a / 9), ac = a % 9, br = Math.floor(b / 9), bc = b % 9;
  return ar === br || ac === bc || (Math.floor(ar / 3) === Math.floor(br / 3) && Math.floor(ac / 3) === Math.floor(bc / 3));
};

const playTone = (type: "tap" | "good" | "bad" | "win", enabled: boolean) => {
  if (!enabled) return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const freq = type === "bad" ? 130 : type === "win" ? 660 : type === "good" ? 520 : 280;
  osc.frequency.value = freq;
  osc.type = type === "bad" ? "sawtooth" : "sine";
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(type === "win" ? 0.08 : 0.045, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === "win" ? 0.38 : 0.14));
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + (type === "win" ? 0.42 : 0.16));
};

const storageKey = "neon-sudoku-progress";
const scoresKey = "neon-sudoku-scores";

const Index = () => {
  const [phase, setPhase] = useState<Phase>("landing");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [cells, setCells] = useState<Cell[]>(() => generatePuzzle("Medium"));
  const [selected, setSelected] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(3);
  const [undo, setUndo] = useState<Move[]>([]);
  const [redo, setRedo] = useState<Move[]>([]);
  const [sound, setSound] = useState(true);
  const [ambient, setAmbient] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const [hinted, setHinted] = useState<number | null>(null);
  const ambientRef = useRef<OscillatorNode | null>(null);
  const ambientCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    const savedScores = localStorage.getItem(scoresKey);
    if (savedScores) setScores(JSON.parse(savedScores));
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      setDifficulty(parsed.difficulty);
      setCells(parsed.cells);
      setTime(parsed.time);
      setMistakes(parsed.mistakes);
      setHints(parsed.hints);
      setUndo(parsed.undo ?? []);
      setPhase("playing");
    }
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => setTime((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing") {
      localStorage.setItem(storageKey, JSON.stringify({ difficulty, cells, time, mistakes, hints, undo }));
    }
  }, [phase, difficulty, cells, time, mistakes, hints, undo]);

  useEffect(() => {
    const complete = cells.every((cell) => cell.value === cell.solution);
    if (phase === "playing" && complete) {
      playTone("win", sound);
      const nextScores = [{ difficulty, time, mistakes, date: new Date().toISOString() }, ...scores]
        .sort((a, b) => a.time + a.mistakes * 30 - (b.time + b.mistakes * 30))
        .slice(0, 8);
      setScores(nextScores);
      localStorage.setItem(scoresKey, JSON.stringify(nextScores));
      localStorage.removeItem(storageKey);
      setPhase("complete");
    }
  }, [cells, difficulty, mistakes, phase, scores, sound, time]);

  useEffect(() => {
    if (!ambient) {
      ambientRef.current?.stop();
      ambientCtx.current?.close();
      ambientRef.current = null;
      ambientCtx.current = null;
      return;
    }
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 54;
    gain.gain.value = 0.018;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    ambientRef.current = osc;
    ambientCtx.current = ctx;
    return () => {
      osc.stop();
      ctx.close();
    };
  }, [ambient]);

  const selectedValue = selected === null ? 0 : cells[selected].value;
  const best = scores[0];

  const startGame = (level: Difficulty) => {
    setDifficulty(level);
    setCells(generatePuzzle(level));
    setSelected(null);
    setTime(0);
    setMistakes(0);
    setHints(3);
    setUndo([]);
    setRedo([]);
    setHinted(null);
    localStorage.removeItem(storageKey);
    setPhase("playing");
  };

  const enterNumber = (num: number) => {
    if (selected === null || cells[selected].given) return;
    const previous = cells[selected].value;
    if (previous === num) return;
    const correct = cells[selected].solution === num;
    setCells((current) => current.map((cell, i) => (i === selected ? { ...cell, value: num } : cell)));
    setUndo((moves) => [...moves, { index: selected, previous, next: num }]);
    setRedo([]);
    if (!correct) setMistakes((m) => m + 1);
    playTone(correct ? "good" : "bad", sound);
  };

  const erase = () => {
    if (selected === null || cells[selected].given) return;
    const previous = cells[selected].value;
    setCells((current) => current.map((cell, i) => (i === selected ? { ...cell, value: 0 } : cell)));
    setUndo((moves) => [...moves, { index: selected, previous, next: 0 }]);
    setRedo([]);
    playTone("tap", sound);
  };

  const useHint = () => {
    if (hints <= 0) return;
    const candidates = cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell.value !== cell.solution && !cell.given);
    if (!candidates.length) return;
    const target = selected !== null && !cells[selected].given && cells[selected].value !== cells[selected].solution
      ? selected
      : candidates[Math.floor(Math.random() * candidates.length)].index;
    const previous = cells[target].value;
    setCells((current) => current.map((cell, i) => (i === target ? { ...cell, value: cell.solution } : cell)));
    setUndo((moves) => [...moves, { index: target, previous, next: cells[target].solution }]);
    setHints((h) => h - 1);
    setHinted(target);
    setSelected(target);
    window.setTimeout(() => setHinted(null), 1200);
    playTone("good", sound);
  };

  const stepUndo = () => {
    const move = undo.at(-1);
    if (!move) return;
    setCells((current) => current.map((cell, i) => (i === move.index ? { ...cell, value: move.previous } : cell)));
    setUndo((moves) => moves.slice(0, -1));
    setRedo((moves) => [...moves, move]);
    playTone("tap", sound);
  };

  const stepRedo = () => {
    const move = redo.at(-1);
    if (!move) return;
    setCells((current) => current.map((cell, i) => (i === move.index ? { ...cell, value: move.next } : cell)));
    setRedo((moves) => moves.slice(0, -1));
    setUndo((moves) => [...moves, move]);
    playTone("tap", sound);
  };

  const particles = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    id: i,
    left: `${(i * 37) % 100}%`,
    top: `${(i * 23) % 100}%`,
    delay: `${(i % 9) * 0.4}s`,
    size: `${3 + (i % 5)}px`,
  })), []);

  return (
    <main className="scanlines relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.24),transparent_28%),radial-gradient(circle_at_82%_10%,hsl(var(--secondary)/0.19),transparent_26%),radial-gradient(circle_at_50%_92%,hsl(var(--accent)/0.14),transparent_24%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_0_42%,hsl(var(--primary)/0.08)_43%,transparent_45%_100%)]" />
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute rounded-full bg-primary animate-float-slow shadow-[0_0_18px_hsl(var(--primary))] motion-reduce:animate-none"
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: p.delay }}
          />
        ))}
      </div>

      {phase === "landing" && (
        <section className="relative z-10 flex min-h-screen items-center justify-center px-5 py-12">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.28em] text-primary shadow-[0_0_24px_hsl(var(--primary)/0.22)]">
              <Zap className="h-4 w-4" /> Neural puzzle grid online
            </div>
            <h1 className="font-display text-5xl font-black uppercase leading-tight md:text-8xl">
              <span className="cyber-text">Neon Sudoku</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl font-body text-xl text-muted-foreground md:text-2xl">
              A high-voltage logic arena with glowing validation, synth audio, animated hints, and local high-score telemetry.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button onClick={() => setPhase("difficulty")} className="hud-button rounded-xl px-8 py-4 font-display text-lg font-black uppercase text-primary focus:outline-none focus:ring-2 focus:ring-ring">
                Start Game
              </button>
              {best && <div className="glass-panel rounded-xl px-5 py-3 font-body text-muted-foreground">Best run: <span className="text-accent">{formatTime(best.time)}</span> / {best.difficulty}</div>}
            </div>
          </div>
        </section>
      )}

      {phase === "difficulty" && (
        <section className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-10">
          <div className="mb-10 text-center">
            <p className="font-display text-sm uppercase tracking-[0.35em] text-secondary">Select transmission intensity</p>
            <h2 className="mt-3 font-display text-4xl font-black uppercase md:text-6xl">Difficulty Matrix</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-4">
            {(Object.keys(difficulties) as Difficulty[]).map((level, i) => (
              <button key={level} onClick={() => startGame(level)} className="glass-panel group rounded-2xl p-6 text-left transition duration-300 hover:-translate-y-2 focus:outline-none focus:ring-2 focus:ring-ring" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="mb-12 flex items-center justify-between">
                  <span className="font-display text-3xl font-black text-primary">0{i + 1}</span>
                  <span className="rounded-full border border-accent/40 px-3 py-1 font-body text-sm text-accent">{81 - difficulties[level]} givens</span>
                </div>
                <h3 className="font-display text-3xl font-black uppercase group-hover:text-secondary">{level}</h3>
                <p className="mt-3 font-body text-muted-foreground">Adaptive puzzle seed with instant validation and HUD telemetry.</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {(phase === "playing" || phase === "complete") && (
        <section className="relative z-10 mx-auto grid min-h-screen max-w-7xl gap-5 px-3 py-5 lg:grid-cols-[260px_1fr_280px] lg:px-6">
          <aside className="glass-panel rounded-2xl p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
            <div className="mb-5 flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <div>
                <p className="font-display text-xl font-black uppercase">N-SDK</p>
                <p className="font-body text-sm text-muted-foreground">{difficulty} protocol</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <button onClick={() => setPhase("difficulty")} className="hud-button rounded-lg px-4 py-3 font-display text-sm uppercase text-foreground">New Game</button>
              <button onClick={useHint} className="hud-button rounded-lg px-4 py-3 font-display text-sm uppercase text-foreground"><Lightbulb className="mr-2 inline h-4 w-4 text-accent" />Hint {hints}</button>
              <button onClick={stepUndo} className="hud-button rounded-lg px-4 py-3 font-display text-sm uppercase text-foreground"><RotateCcw className="mr-2 inline h-4 w-4" />Undo</button>
              <button onClick={stepRedo} className="hud-button rounded-lg px-4 py-3 font-display text-sm uppercase text-foreground"><RotateCw className="mr-2 inline h-4 w-4" />Redo</button>
              <button onClick={() => setSound((v) => !v)} className="hud-button rounded-lg px-4 py-3 font-display text-sm uppercase text-foreground">{sound ? <Volume2 className="mr-2 inline h-4 w-4" /> : <VolumeX className="mr-2 inline h-4 w-4" />}SFX</button>
              <button onClick={() => setAmbient((v) => !v)} className="hud-button rounded-lg px-4 py-3 font-display text-sm uppercase text-foreground"><Music className="mr-2 inline h-4 w-4" />Ambient</button>
            </div>
          </aside>

          <div className="flex flex-col items-center justify-center gap-5">
            <header className="grid w-full grid-cols-3 gap-3">
              <div className="glass-panel rounded-xl p-3 text-center"><p className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground">Timer</p><p className="font-display text-2xl text-primary">{formatTime(time)}</p></div>
              <div className="glass-panel rounded-xl p-3 text-center"><p className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground">Errors</p><p className="font-display text-2xl text-destructive">{mistakes}</p></div>
              <div className="glass-panel rounded-xl p-3 text-center"><p className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground">Hints</p><p className="font-display text-2xl text-accent">{hints}</p></div>
            </header>

            <div className="glass-panel w-full max-w-[min(92vw,640px)] rounded-2xl p-2 sm:p-4">
              <div className="grid aspect-square grid-cols-9 gap-1 rounded-xl border-2 border-primary/50 bg-surface/70 p-1 shadow-[inset_0_0_40px_hsl(var(--primary)/0.08)]">
                {cells.map((cell, index) => {
                  const isSelected = selected === index;
                  const isRelated = selected !== null && related(selected, index);
                  const isSame = selectedValue !== 0 && cell.value === selectedValue;
                  const wrong = cell.value !== 0 && cell.value !== cell.solution;
                  const correct = cell.value !== 0 && cell.value === cell.solution && !cell.given;
                  const boxBorder = `${index % 3 === 0 ? "border-l-primary/60" : "border-l-border"} ${Math.floor(index / 9) % 3 === 0 ? "border-t-primary/60" : "border-t-border"} ${(index + 1) % 3 === 0 ? "border-r-primary/60" : "border-r-border"} ${Math.floor(index / 9) % 3 === 2 ? "border-b-primary/60" : "border-b-border"}`;
                  return (
                    <button
                      key={index}
                      onClick={() => { setSelected(index); playTone("tap", sound); }}
                      className={`relative flex items-center justify-center border text-center font-display text-xl font-black transition duration-200 focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring sm:text-3xl ${boxBorder} ${isSelected ? "bg-grid-selected shadow-[0_0_24px_hsl(var(--primary)/0.4)]" : isRelated ? "bg-grid-related" : "bg-background/60"} ${isSame ? "text-accent" : cell.given ? "text-grid-given" : wrong ? "text-destructive" : correct ? "text-success" : "text-foreground"} ${wrong ? "shadow-[0_0_18px_hsl(var(--destructive)/0.5)]" : correct ? "shadow-[0_0_16px_hsl(var(--success)/0.32)]" : ""} ${hinted === index ? "animate-pulse-neon" : ""}`}
                    >
                      <span className={cell.value ? "animate-pop-cell motion-reduce:animate-none" : ""}>{cell.value || ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid w-full max-w-[min(92vw,640px)] grid-cols-5 gap-2 sm:grid-cols-10">
              {digits.map((num) => <button key={num} onClick={() => enterNumber(num)} className="hud-button aspect-square rounded-lg font-display text-xl font-black text-primary focus:outline-none focus:ring-2 focus:ring-ring">{num}</button>)}
              <button onClick={erase} className="hud-button rounded-lg px-3 font-display text-sm uppercase text-secondary focus:outline-none focus:ring-2 focus:ring-ring">Erase</button>
            </div>
          </div>

          <aside className="glass-panel rounded-2xl p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
            <div className="mb-5 flex items-center gap-2"><Trophy className="h-5 w-5 text-accent" /><h3 className="font-display text-xl font-black uppercase">Leaderboard</h3></div>
            <div className="space-y-3">
              {scores.length ? scores.map((score, i) => (
                <div key={`${score.date}-${i}`} className="rounded-lg border border-border bg-muted/50 p-3 font-body">
                  <div className="flex justify-between font-display"><span className="text-primary">#{i + 1}</span><span>{formatTime(score.time)}</span></div>
                  <div className="mt-1 flex justify-between text-sm text-muted-foreground"><span>{score.difficulty}</span><span>{score.mistakes} errors</span></div>
                </div>
              )) : <div className="rounded-lg border border-border bg-muted/40 p-4 text-center font-body text-muted-foreground">Complete a grid to upload your first local score.</div>}
            </div>
          </aside>
        </section>
      )}

      {phase === "complete" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 px-5 backdrop-blur-md">
          {Array.from({ length: 24 }, (_, i) => <span key={i} className="absolute bottom-0 h-3 w-3 rounded-full bg-accent animate-celebrate" style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 8) * 90}ms` }} />)}
          <div className="glass-panel relative max-w-xl rounded-2xl p-8 text-center">
            <p className="font-display text-sm uppercase tracking-[0.35em] text-accent">Grid synchronized</p>
            <h2 className="cyber-text mt-3 font-display text-5xl font-black uppercase">Solved</h2>
            <div className="mt-6 grid grid-cols-3 gap-3 font-body">
              <div className="rounded-lg border border-border p-3"><p className="text-muted-foreground">Time</p><p className="font-display text-xl text-primary">{formatTime(time)}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-muted-foreground">Mode</p><p className="font-display text-xl text-secondary">{difficulty}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-muted-foreground">Errors</p><p className="font-display text-xl text-destructive">{mistakes}</p></div>
            </div>
            <button onClick={() => setPhase("difficulty")} className="hud-button mt-7 rounded-xl px-7 py-3 font-display font-black uppercase text-primary focus:outline-none focus:ring-2 focus:ring-ring">Play Again</button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Index;
