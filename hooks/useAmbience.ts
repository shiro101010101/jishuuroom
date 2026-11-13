// hooks/useAmbience.ts — 重ねて流せる環境音（雨・時計・虫の声・部屋の空気）
// 音声ファイルは使わず Web Audio で合成する。BGM とは別に鳴らせる
'use client'
import { useEffect, useRef, useState } from 'react'

export type AmbienceId = 'rain' | 'clock' | 'crickets' | 'room' | 'pages' | 'pencil'
export const AMBIENCE: { id: AmbienceId; ja: string; en: string }[] = [
  { id: 'rain',     ja: '窓に当たる雨',     en: 'Rain on the window' },
  { id: 'clock',    ja: '時計の秒針',       en: 'Clock ticking' },
  { id: 'crickets', ja: '夜の虫の声',       en: 'Night crickets' },
  { id: 'room',     ja: '静かな部屋の空気', en: 'Quiet room tone' },
  { id: 'pages',    ja: 'ページをめくる音', en: 'Turning pages' },
  { id: 'pencil',   ja: '遠くの鉛筆の音',   en: 'Distant pencils' },
]
const DEFAULT_LEVELS: Record<AmbienceId, number> = { rain: .6, clock: .35, crickets: .3, room: .4, pages: .5, pencil: .35 }
const STORAGE_KEY = 'ambience-levels'

type Running = { out: GainNode; stop: () => void }

function noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown', seconds = 4) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    if (color === 'white') d[i] = w
    else if (color === 'pink') {
      b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526
      d[i] = (b0 + b1 + b2 + w * .1848) * .2
    } else { last = (last + .02 * w) / 1.02; d[i] = last * 3.5 }
  }
  return buf
}

function loop(ctx: AudioContext, buf: AudioBuffer) {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start(); return src
}

/** 短いノイズの粒（雨粒・秒針の音） */
function blip(ctx: AudioContext, white: AudioBuffer, dest: AudioNode, freq: number, q: number, peak: number, decay: number) {
  const src = ctx.createBufferSource(); src.buffer = white
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q
  const g = ctx.createGain(); const t = ctx.currentTime
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + decay)
  src.connect(f).connect(g).connect(dest)
  src.start(t, Math.random() * 3, decay + .05)
}

function startSound(ctx: AudioContext, id: AmbienceId, out: GainNode): () => void {
  const white = noiseBuffer(ctx, 'white', 4)
  const timers: ReturnType<typeof setInterval>[] = []
  const nodes: AudioScheduledSourceNode[] = []
  const cleanups: (() => void)[] = []

  if (id === 'rain') {
    // さーっという雨の層 + ときどき強まる風 + 窓に当たる雨粒
    const bed = loop(ctx, noiseBuffer(ctx, 'pink', 6)); nodes.push(bed)
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200
    const bedGain = ctx.createGain(); bedGain.gain.value = .55
    const lfo = ctx.createOscillator(); lfo.frequency.value = .06; const lfoAmt = ctx.createGain(); lfoAmt.gain.value = .15
    lfo.connect(lfoAmt).connect(bedGain.gain); lfo.start(); nodes.push(lfo)
    bed.connect(hp).connect(lp).connect(bedGain).connect(out)
    timers.push(setInterval(() => {
      if (Math.random() < .45) blip(ctx, white, out, 1800 + Math.random() * 3800, 6 + Math.random() * 6, .05 + Math.random() * .12, .03 + Math.random() * .04)
    }, 55))
  } else if (id === 'clock') {
    // カチ、コチ、と交互に少し音程が違う
    let tock = false
    const tick = () => { blip(ctx, white, out, tock ? 2300 : 3100, 3, .55, .035); tock = !tock }
    tick(); timers.push(setInterval(tick, 1000))
  } else if (id === 'crickets') {
    // 2匹の虫が、それぞれのリズムで鳴く
    const voice = (freq: number, pan: number) => {
      const osc = ctx.createOscillator(); osc.frequency.value = freq
      const amp = ctx.createGain(); amp.gain.value = 0
      const p = ctx.createStereoPanner(); p.pan.value = pan
      osc.connect(amp).connect(p).connect(out); osc.start(); nodes.push(osc)
      const chirp = () => {
        const t = ctx.currentTime
        for (let i = 0; i < 3; i++) {
          const s = t + i * .055
          amp.gain.setValueAtTime(0, s); amp.gain.linearRampToValueAtTime(.05, s + .012); amp.gain.linearRampToValueAtTime(0, s + .035)
        }
      }
      timers.push(setInterval(() => { if (Math.random() < .7) chirp() }, 700 + Math.random() * 500))
    }
    voice(4350, -.5); voice(4720, .4)
  } else if (id === 'pages') {
    // 図書館のどこかで、ときどき誰かがページをめくる（紙がこすれる「さっ」という音）
    const turn = () => {
      const t = ctx.currentTime, len = .25 + Math.random() * .25
      const src = ctx.createBufferSource(); src.buffer = white
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + Math.random() * 1600; bp.Q.value = .8
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + len * .3)
      g.gain.linearRampToValueAtTime(.07, t + len * .6); g.gain.exponentialRampToValueAtTime(.0001, t + len)
      const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - .8
      src.connect(bp).connect(hp).connect(g).connect(p).connect(out)
      src.start(t, Math.random() * 3, len + .05)
    }
    let next: ReturnType<typeof setTimeout>
    const schedule = () => { next = setTimeout(() => { turn(); schedule() }, 4000 + Math.random() * 9000) }
    turn(); schedule()
    cleanups.push(() => clearTimeout(next))
  } else if (id === 'pencil') {
    // 遠くの席で鉛筆が紙の上を走る音（短いこすれが、文字を書くリズムで続く）
    const stroke = (when: number) => {
      const len = .05 + Math.random() * .12
      const src = ctx.createBufferSource(); src.buffer = white
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200 + Math.random() * 2500; bp.Q.value = 1.5
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(.05 + Math.random() * .04, when + .01); g.gain.linearRampToValueAtTime(0, when + len)
      src.connect(bp).connect(g).connect(out)
      src.start(when, Math.random() * 3, len + .02)
    }
    timers.push(setInterval(() => {
      if (Math.random() < .35) return   // 考えている間は手が止まる
      const t = ctx.currentTime, n = 3 + Math.floor(Math.random() * 6)
      let at = t
      for (let i = 0; i < n; i++) { stroke(at); at += .08 + Math.random() * .16 }
    }, 1600))
  } else {
    // エアコンや外の気配のような、低くやわらかいざわめき
    const src = loop(ctx, noiseBuffer(ctx, 'brown', 6)); nodes.push(src)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480
    const g = ctx.createGain(); g.gain.value = .9
    src.connect(lp).connect(g).connect(out)
  }

  return () => {
    timers.forEach(clearInterval)
    cleanups.forEach(f => f())
    nodes.forEach(n => { try { n.stop() } catch {} })
    out.disconnect()
  }
}

export function useAmbience(masterVolume = 1) {
  const ctxRef = useRef<AudioContext | null>(null)
  const runningRef = useRef<Partial<Record<AmbienceId, Running>>>({})
  const [active, setActive] = useState<AmbienceId[]>([])
  const [levels, setLevels] = useState<Record<AmbienceId, number>>(DEFAULT_LEVELS)

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (saved) setLevels({ ...DEFAULT_LEVELS, ...saved }) } catch {}
    return () => {
      Object.values(runningRef.current).forEach(r => r?.stop())
      runningRef.current = {}
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    }
  }, [])

  // 音量の変更をすぐ反映
  useEffect(() => {
    for (const [id, r] of Object.entries(runningRef.current) as [AmbienceId, Running][]) {
      if (r && ctxRef.current) r.out.gain.setTargetAtTime(levels[id] * masterVolume, ctxRef.current.currentTime, .1)
    }
  }, [levels, masterVolume])

  async function toggle(id: AmbienceId) {
    const running = runningRef.current[id]
    if (running) {
      const ctx = ctxRef.current!
      running.out.gain.setTargetAtTime(0, ctx.currentTime, .25)   // ふっと消える
      setTimeout(() => running.stop(), 900)
      delete runningRef.current[id]
      setActive(a => a.filter(x => x !== id))
      return
    }
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      ctxRef.current = new Ctx()
    }
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    const out = ctx.createGain(); out.gain.value = 0
    out.connect(ctx.destination)
    out.gain.setTargetAtTime(levels[id] * masterVolume, ctx.currentTime, .4)  // ゆっくり聞こえてくる
    runningRef.current[id] = { out, stop: startSound(ctx, id, out) }
    setActive(a => [...a, id])
  }

  function setLevel(id: AmbienceId, v: number) {
    setLevels(prev => {
      const next = { ...prev, [id]: v }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return { active, levels, toggle, setLevel }
}
