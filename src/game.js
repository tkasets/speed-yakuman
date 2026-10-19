import { deal } from './wall.js';
import { judge } from './yakuman.js';
import { cpuDiscard } from './cpu.js';
import { countsOf, sortTiles, doraOf } from './tiles.js';
import { now } from './timer.js';
import { waitsOf, discardsToTenpai } from './tenpai.js';

export class Game {
  constructor({ onChange, onWin, speed = 150, forcedHand = null }) {
    this.onChange = onChange;
    this.onWin = onWin;
    this.speed = speed;
    this.forcedHand = forcedHand;
    this.phase = 'idle'; // idle | playing | won
    this.gen = 0;
    this.resets = 0;
    this.melds = [];
    this.hand = [];
    this.rivers = [[], [], [], []];
    this.pending = null;
    this.drawn = null;
    this.wall = [];
    this.result = null;
    this.notice = '';
  }

  // ---- 操作 ----
  startRun() {
    this.resets = 0;
    this.result = null;
    this.phase = 'playing';
    this.runStartAt = now();
    this._deal();
  }

  // ホーム(スタート画面)に戻る。進行中の局は破棄する
  home() {
    this.gen++;
    this.phase = 'idle';
    this.pending = null;
    this.result = null;
    this.queued = null;
    this.riichiPrompt = null;
    this._emit();
  }

  reset() {
    if (this.phase !== 'playing') return;
    this.resets++;
    this._deal();
  }

  // i: 手牌の index、または 'd' (ツモ切り)
  // riichi: true ならリーチ宣言つきで切る
  discard(i, riichi = false) {
    if (!this._myTurn()) return;
    if (this.riichi && i !== 'd') return; // リーチ後はツモ切りのみ
    const cand = i === 'd' ? this.drawn : this.hand[i];
    if (cand === null || cand === undefined) return;
    if (riichi && !(this.pending.riichiTiles || []).includes(cand)) return; // リーチ宣言は聴牌になる牌のみ
    this.riichiPrompt = null;
    let tile;
    if (i === 'd') {
      tile = this.drawn;
    } else {
      tile = this.hand.splice(i, 1)[0];
      if (this.drawn !== null) this.hand.push(this.drawn);
    }
    this.hand = sortTiles(this.hand);
    this.drawn = null;
    if (riichi) {
      this.riichi = true;
      this.doubleRiichi = this.firstTurn;
      this.ippatsu = true;
      this.riichiAt = this.rivers[0].length;
    } else if (this.riichi) {
      this.ippatsu = false;
    }
    this.myDiscards.add(tile);
    this.doraCount = Math.min(5, this.doraCount + this.pendingKanDora);
    this.pendingKanDora = 0;
    this.tempFuriten = false; // 同巡内フリテンは自分の打牌で解除
    this.firstTurn = false;
    this.pending = null;
    this.notice = '';
    this.rivers[0].push(tile);
    this._emit();
    this._later(() => this._cpuStep(1));
  }

  // 自分の番以外でも牌をクリックできる: 鳴き待ちならスキップし、次の自分の番に先打ちとして予約する
  pick(i) {
    if (this.phase !== 'playing') return;
    if (this._myTurn()) {
      // 聴牌になる牌を切るときは、リーチするか確認する
      const cand = i === 'd' ? this.drawn : this.hand[i];
      if (!this.riichi && cand !== undefined && (this.pending.riichiTiles || []).includes(cand)) {
        this.riichiPrompt = i;
        return this._emit();
      }
      return this.discard(i);
    }
    if (this.riichi) return; // リーチ中は先打ち予約できない
    const t = i === 'd' ? this.drawn : this.hand[i];
    if (t === null || t === undefined) return;
    this.queued = this.queued === t ? null : t; // 同じ牌をもう一度押すと取り消し
    if (this.pending && this.pending.kind === 'call' && this.queued !== null) return this.skip();
    this._emit();
  }

  // リーチ確認: yes=リーチして切る / no=リーチせず切る
  confirmRiichi(yes) {
    const i = this.riichiPrompt;
    if (i === null || i === undefined) return;
    this.discard(i, yes);
  }

  cancelRiichiPrompt() {
    if (this.riichiPrompt === null) return;
    this.riichiPrompt = null;
    this._emit();
  }

  // 現在の手牌がフリテンならその理由、そうでなければ ''
  furitenReason(waits) {
    if (this.riichiFuriten) return 'リーチ後の見逃し';
    if (this.tempFuriten) return '見逃し';
    if (waits.some((w) => this.myDiscards.has(w.tile))) return '自分の捨て牌に待ち牌';
    return '';
  }

  _doraTiles() {
    return this.doraIndicators.slice(0, this.doraCount).map(doraOf);
  }

  _uraTiles() {
    return this.uraIndicators.slice(0, this.doraCount).map(doraOf);
  }

  // カンドラ: 暗槓はすぐ、大明槓・加槓は次の打牌後にめくる
  _kanDora(immediate) {
    if (immediate) this.doraCount = Math.min(5, this.doraCount + 1);
    else this.pendingKanDora++;
  }

  _flags() {
    return {
      dora: this._doraTiles(),
      riichi: this.riichi ? (this.doubleRiichi ? 2 : 1) : 0,
      ippatsu: this.ippatsu,
      ura: this.riichi ? this._uraTiles() : undefined,
    };
  }

  _toast(msg) {
    this.toast = msg;
    this._emit();
    setTimeout(() => {
      if (this.toast === msg) {
        this.toast = '';
        this._emit();
      }
    }, 1800);
  }

  tsumo() {
    if (!this._myTurn() || !this.pending.tsumo) return;
    this.queued = null;
    this._win(this.pending.tsumo, 'ツモ', { tile: this.drawn, from: 0 });
  }

  ankan(t) {
    if (!this._myTurn() || !this.pending.ankan.includes(t)) return;
    this.hand = sortTiles(this.hand.concat([this.drawn]).filter((x) => x !== t));
    this.drawn = null;
    this.melds.push({ type: 'ankan', tiles: [t, t, t, t] });
    this._kanDora(true);
    this.firstTurn = false;
    this._myDraw(true);
  }

  kakan(t) {
    if (!this._myTurn() || !this.pending.kakan.includes(t)) return;
    const all = this.hand.concat([this.drawn]);
    all.splice(all.indexOf(t), 1);
    this.hand = sortTiles(all);
    this.drawn = null;
    const meld = this.melds.find((m) => m.type === 'pon' && m.tiles[0] === t);
    meld.type = 'kakan';
    meld.tiles.push(t);
    this._kanDora(false);
    this.firstTurn = false;
    this._myDraw(true);
  }

  call(optIndex) {
    const p = this.pending;
    if (this.phase !== 'playing' || !p || p.kind !== 'call') return;
    const opt = p.options[optIndex];
    if (!opt || opt.disabled) return;
    const d = p.tile;
    if (opt.type === 'ron') return this._win(opt.yaku, 'ロン', { tile: d, from: p.from });
    this.rivers[p.from].pop();
    this.queued = null;
    this.firstTurn = false;
    const take = (tiles) => {
      for (const t of tiles) this.hand.splice(this.hand.indexOf(t), 1);
    };
    if (opt.type === 'pon') {
      take([d, d]);
      this.melds.push({ type: 'pon', tiles: [d, d, d], from: p.from });
    } else if (opt.type === 'minkan') {
      take([d, d, d]);
      this.melds.push({ type: 'minkan', tiles: [d, d, d, d], from: p.from });
      this._kanDora(false);
      this.pending = null;
      return this._myDraw(true);
    } else if (opt.type === 'chi') {
      const seq = [opt.base, opt.base + 1, opt.base + 2];
      take(seq.filter((t) => t !== d));
      this.melds.push({ type: 'chi', tiles: seq, from: p.from });
    }
    this.drawn = null;
    this.pending = { kind: 'self', tsumo: null, ankan: [], kakan: [], riichiTiles: [] };
    this._emit();
  }

  skip() {
    const p = this.pending;
    if (this.phase !== 'playing' || !p || p.kind !== 'call') return;
    if (p.options.some((o) => o.type === 'ron' && !o.disabled)) {
      this.tempFuriten = true; // ロンを見逃した → フリテン
      if (this.riichi) this.riichiFuriten = true;
    }
    this.pending = null;
    this._emit();
    this._next(p.from);
  }

  // ---- 内部 ----
  _myTurn() {
    return this.phase === 'playing' && this.pending && this.pending.kind === 'self';
  }

  _later(fn, ms = this.speed) {
    const g = this.gen;
    setTimeout(() => {
      if (g === this.gen && this.phase === 'playing') fn();
    }, ms);
  }

  _emit() {
    this.onChange(this);
  }

  _deal() {
    this.gen++;
    const d = deal(this.forcedHand);
    this.forcedHand = null; // デバッグ用の指定は最初の1回だけ
    this.wall = d.wall;
    this.rinshan = d.rinshan;
    this.doraIndicators = d.doraIndicators;
    this.uraIndicators = d.uraIndicators;
    this.doraCount = 1;
    this.pendingKanDora = 0;
    this.hand = sortTiles(d.hands[0]);
    this.cpu = [null, d.hands[1], d.hands[2], d.hands[3]];
    this.melds = [];
    this.rivers = [[], [], [], []];
    this.drawn = null;
    this.firstTurn = true;
    this.pending = null;
    this.dealStartAt = now();
    this.notice = '';
    this.queued = null;
    this.riichi = false;
    this.riichiPrompt = null;
    this.doubleRiichi = false;
    this.ippatsu = false;
    this.riichiAt = -1;
    this.myDiscards = new Set();
    this.tempFuriten = false;
    this.riichiFuriten = false;
    this.toast = '';
    this._myDraw(false, d.firstDraw);
  }

  _myDraw(rinshan, forced = null) {
    let t = forced;
    if (t === null) {
      if (!rinshan && this.wall.length === 0) return this._ryuukyoku();
      t = rinshan ? this.rinshan.pop() : this.wall.pop();
    }
    this.drawn = t;
    const counts = countsOf(this.hand.concat([t]));
    const y = judge({
      counts,
      melds: this.melds,
      winTile: t,
      tsumo: true,
      tenhou: this.firstTurn,
      ...this._flags(),
      rinshan,
      haitei: !rinshan && this.wall.length === 0,
    });
    const ankan = [];
    const kakan = [];
    if (this.rinshan.length > 0 && !this.riichi) {
      for (let k = 0; k < 34; k++) if (counts[k] === 4) ankan.push(k);
      for (const m of this.melds) if (m.type === 'pon' && counts[m.tiles[0]] >= 1) kakan.push(m.tiles[0]);
    }
    // リーチ可能な打牌 (門前・未リーチ・聴牌になる牌。役の有無は問わない)
    let riichiTiles = [];
    if (!this.riichi && this.melds.every((m) => m.type === 'ankan') && this.wall.length >= 4) {
      const all = this.hand.concat([t]);
      riichiTiles = discardsToTenpai(all, this.melds, this._doraTiles(), { riichi: 1 }).map((x) => x.discard);
    }
    this.pending = { kind: 'self', tsumo: y.length ? y : null, ankan, kakan, riichiTiles };
    this._emit();
    if (this.riichi && !this.pending.tsumo) this._later(() => this._myTurn() && this.discard('d'), 450);
    // 予約済みの打牌を自動で行う (和了できるときは自動で捨てない)
    const q = this.queued;
    this.queued = null;
    if (q !== null && !this.pending.tsumo) {
      const idx = this.drawn === q ? 'd' : this.hand.indexOf(q);
      if (idx !== -1) this._later(() => this._myTurn() && this.discard(idx), 100);
    }
  }

  _cpuStep(p) {
    if (this.wall.length === 0) return this._ryuukyoku();
    const h = this.cpu[p];
    h.push(this.wall.pop());
    const d = h.splice(cpuDiscard(h), 1)[0];
    this.rivers[p].push(d);
    const options = this._callOptions(d, p);
    const ronBlocked = options.find((o) => o.type === 'ron' && o.disabled);
    if (ronBlocked) this._toast(`フリテン: ロンできません (${ronBlocked.reason})`);
    if (options.some((o) => !o.disabled)) {
      this.pending = { kind: 'call', tile: d, from: p, options };
      return this._emit();
    }
    this._emit();
    this._next(p);
  }

  _next(p) {
    if (p === 3) this._later(() => this._myDraw(false));
    else this._later(() => this._cpuStep(p + 1));
  }

  _callOptions(d, from) {
    const opts = [];
    const counts = countsOf(this.hand);
    const y = judge({
      counts: countsOf(this.hand.concat([d])),
      melds: this.melds,
      winTile: d,
      tsumo: false,
      ...this._flags(),
      haitei: this.wall.length === 0,
    });
    if (y.length) {
      const reason = this.furitenReason(waitsOf(this.hand, this.melds, this._doraTiles(), { riichi: 1 }));
      opts.push({ type: 'ron', yaku: y, disabled: !!reason, reason });
    }
    if (this.riichi) return opts; // リーチ中は鳴けない
    if (counts[d] >= 2) opts.push({ type: 'pon' });
    if (counts[d] >= 3 && this.rinshan.length > 0) opts.push({ type: 'minkan' });
    if (from === 3 && d < 27) {
      const suit = Math.floor(d / 9);
      for (let b = d - 2; b <= d; b++) {
        if (b < 0 || Math.floor(b / 9) !== suit || b % 9 > 6) continue;
        const need = [b, b + 1, b + 2].filter((t) => t !== d);
        if (need.every((t) => counts[t] >= 1)) opts.push({ type: 'chi', base: b });
      }
    }
    return opts;
  }

  _ryuukyoku() {
    this.notice = '流局 — 配り直し';
    this.pending = null;
    this._emit();
    this._later(() => this._deal(), 2200);
  }

  _win(yaku, how, win) {
    const t = now();
    this.phase = 'won';
    this.pending = null;
    this.result = {
      ms: t - this.runStartAt,
      dealMs: t - this.dealStartAt,
      yaku,
      detail: yaku.detail || '',
      kind: yaku.kind || 'yakuman',
      hand: sortTiles(this.hand),
      melds: this.melds.map((m) => ({ ...m, tiles: m.tiles.slice() })),
      win,
      doraInds: this.doraIndicators.slice(0, this.doraCount),
      uraInds: this.riichi ? this.uraIndicators.slice(0, this.doraCount) : null,
      how,
      resets: this.resets,
    };
    this._emit();
    this.onWin(this.result);
  }
}
