'use strict';

/* =========================================================================
   負荷テスト・サンドボックス
   -------------------------------------------------------------------------
   対象 URL は自由に指定できる（元の形式）。
   安全性は「速度と総量の上限」で担保する:
     - 最短間隔 500 ms = 最大 2 req/s
     - 同時接続 1
     - 1 回 100 回 / 毎分 120 回 / 同一ホスト 1 セッション 200 回 / 3 分
     - 応答を必ず読み、3 回連続失敗で停止
   上限は Object.freeze した定数で、UI からは引き上げられない。
   ========================================================================= */

const SAFETY = Object.freeze({
  PROBE_PATH: 'assets/ping.txt',     // 既定の対象（同梱・同一オリジン）
  MAX_REQUESTS_PER_RUN: 100,         // 1 回の実行で送る最大件数
  MAX_REQUESTS_PER_MINUTE: 120,      // ローリング 60 秒あたり（毎秒 2 回 × 60 秒）
  SESSION_CAP_PER_ORIGIN: 200,       // 同一オリジンに対する 1 セッション合計
  MIN_INTERVAL_MS: 500,              // 最短間隔 = 最大 2 req/s
  MAX_INTERVAL_MS: 5000,
  DEFAULT_INTERVAL_MS: 1000,
  CONCURRENCY: 1,                    // 同時接続は常に 1
  TIMEOUT_MS: 3000,
  MAX_RUN_MS: 180000,                // 3 分で必ず終了（100 回 × 1 秒 = 100 秒を収容）
  MAX_CONSECUTIVE_ERRORS: 3,         // 連続失敗で打ち切り
});

/* ---------------- クリックジャッキング対策 ----------------
   frame-ancestors は <meta> では無視されるため、JS 側で代替する。 */

const FRAMED = (() => {
  try {
    return window.top !== window.self;
  } catch (_) {
    return true;
  }
})();

if (FRAMED) {
  document.documentElement.setAttribute('data-framed', '');
  const notice = document.createElement('div');
  notice.className = 'framed-block';
  ['このページは iframe 内では動作しません。直接開いてください。',
    'This page does not run inside a frame. Open it directly.',
    '本页不在 iframe 内运行，请直接打开。'].forEach((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      notice.appendChild(p);
    });
  document.body.textContent = '';
  document.body.appendChild(notice);
  throw new Error('refusing to run inside a frame');
}

/* ---------------- 既定ターゲット（同梱・同一オリジン） ---------------- */

const BUNDLED_TARGET = (() => {
  const url = new URL(SAFETY.PROBE_PATH, window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error('bundled target must be same-origin');
  }
  url.hash = '';
  return Object.freeze({ url, origin: url.origin, kind: 'bundled' });
})();

/* ---------------- i18n ---------------- */

const I18N = {
  ja: {
    skip: '本文へ',
    title: '負荷テスト・サンドボックス',
    lede: 'URL を指定して計測できます。送信レートは 1 秒あたり 2 回まで、同時接続は 1 本に固定されています。',
    noticeTitle: 'これは計測ツールで、攻撃ツールではありません',
    noticeBody: '速度の上限はコード内の定数で固定されており、画面から引き上げることはできません。最大でも毎秒 2 回・1 回 100 回までなので、相手に過大な負荷をかける用途には使えません。自分が管理するか、管理者の許可を得たサーバーだけを対象にしてください。',
    modeTitle: 'モード',
    modeSimName: 'シミュレーション（既定）',
    modeSimDesc: 'ネットワーク送信は 0 件。合成データで遅延分布とエラー率の見方を練習できます。',
    modeProbeName: 'セルフ計測',
    modeProbeDesc: '指定した対象へ、間隔をあけて実際にリクエストを送ります。',
    targetCardTitle: '測定対象',
    badgeBundled: '同梱',
    badgeCustom: '指定',
    targetUrlLabel: '対象 URL',
    applyTargetBtn: 'この URL を使う',
    resetTargetBtn: '既定に戻す',
    targetHint: '未指定ならこのページに同梱した静的ファイルを測ります。http:// と https:// のみ対応します。',
    targetMsgCustom: '対象を切り替えました。',
    targetMsgReset: '対象を同梱ファイルに戻しました。',
    conditionsTitle: '計測条件',
    limitLabel: 'ハードリミット',
    limitText: '1 回 100 回まで / 同時 1 / 最短 500 ms（毎秒 2 回まで）/ 毎分 120 回 / 同一ホスト 1 セッション 200 回 / 3 分で自動終了',
    intervalLabel: '送信間隔',
    budgetLabel: '総リクエスト数',
    budgetHint: '上限 100 回（コードで固定）',
    gateTitle: 'セルフ計測の前提',
    ownCheck: 'この対象の管理者であり、計測の許可を得ています。',
    confirmLabel: '確認のため TEST と入力',
    gateWarn: '実行条件がそろっていません。',
    startBtn: '開始',
    stopBtn: '停止',
    resetBtn: 'リセット',
    reportBtn: 'レポートを保存',
    stateIdle: '待機中',
    sessionSuffix: '（このホスト累計 {n} 回）',
    stateRunning: '実行中',
    stateDone: '完了',
    statSent: '送信',
    statOk: '成功',
    statErr: '失敗',
    statP50: 'p50 遅延',
    statP95: 'p95 遅延',
    statElapsed: '経過',
    chartTitle: '遅延の分布（横軸: ミリ秒、縦軸: 回数）',
    logTitle: '実行ログ',
    diffTitle: '元のコードから何を変えたか',
    diffColOld: '元の実装',
    diffColNew: 'この実装',
    diff1a: '任意の URL を入力して送信できた',
    diff1b: '同じく任意の URL を指定できる（そのまま）',
    diff2a: '毎秒 1〜100000 件、同時 200 件を並列送信',
    diff2b: '最短 500 ms 間隔（毎秒 2 回まで）・同時 1 件・1 回 100 回まで',
    diff3a: '停止しない限り送信し続けた',
    diff3b: '件数・3 分・毎分 120 回・同一ホスト 200 回で自動終了',
    diff4a: 'no-cors で応答を読まずに投げ続けた',
    diff4b: '応答を必ず読み、3 回連続で失敗したら停止',
    diff5a: 'CDN のスクリプトとインライン onclick',
    diff5b: '外部依存ゼロ・CSP・DOM は textContent のみ',
    diff6a: '入力検証がなかった',
    diff6b: 'http/https のみ許可し、認証情報入り URL は拒否',
    whyTitle: '安全性はどこで担保しているか',
    why1: '上限は凍結した定数。画面から引き上げる手段がありません（最大毎秒 2 回）。',
    why2: '同時接続は常に 1 本。回線やブラウザを飽和させません。',
    why3: '応答を必ず読み、失敗が続けば自動で止まります（盲撃ちをしない）。',
    why4: 'タブが非表示になると停止し、通信と計測を打ち切ります。',
    why5: '既定はシミュレーションで、クリックしても 1 バイトも送信しません。',
    footer: '自分が管理するか、管理者の許可を得たサーバーだけを対象にしてください。第三者への負荷送信は不正アクセス禁止法や各国法令に触れます。',
    errUrlEmpty: 'URL を入力してください。',
    errUrlInvalid: 'URL の形式が正しくありません（例: http://127.0.0.1:8000/）。',
    errScheme: 'http:// または https:// の URL のみ対応します。',
    errCredentials: 'URL にユーザー名やパスワードを含めることはできません。',
    errMixedContent: 'https のページから http の対象へは送信できません（localhost / 127.0.0.1 を除く）。ページを http で開くか、対象を https にしてください。',
    errTargetChanged: '対象が実行開始時のものと一致しません。',
    errSessionCap: 'このホストに対する 1 セッションの上限（60 回）に達しました。',
    errAuth: '管理者チェックと TEST の入力が必要です。',
    errOrigin: 'このオリジンでは実送信できません（http/https で開いてください）。',
    logSim: 'シミュレーション: ネットワーク送信 0 件',
    logStart: '開始: {url} / {n} 回 / {ms} ms 間隔',
    logReq: 'GET {path} → {status} ({ms} ms)',
    logDone: '終了: 送信 {n} 回 / 失敗 {e} 回',
    logStopLimit: '停止: 設定した回数に達しました',
    logStopUser: '停止: ユーザー操作',
    logStopHidden: '停止: タブが非表示',
    logStopTime: '停止: 3 分の上限',
    logStopFail: '停止: 3 回連続で失敗',
    logNetworkHint: 'ヒント: URL・ポート・CORS ヘッダ（Access-Control-Allow-Origin）を確認してください。',
    repTitle: '負荷テスト結果',
    repMode: 'モード',
    repTarget: '対象',
    repTargetKind: '対象の種類',
    repKindBundled: '同梱ファイル（同一オリジン）',
    repKindCustom: '指定した URL',
    repSent: '送信件数',
    repFail: '失敗件数',
    repP50: 'p50 遅延',
    repP95: 'p95 遅延',
    repNote: '速度上限はコードで固定されています（最大毎秒 2 回）。',
    repSynthetic: 'シミュレーション（送信 0 件、合成データ）',
  },

  en: {
    skip: 'Skip to content',
    title: 'Load-testing sandbox',
    lede: 'Pick any URL to measure. The send rate is capped at 2 requests per second with a single in-flight request.',
    noticeTitle: 'This is a measurement tool, not an attack tool',
    noticeBody: 'The rate limits are constants in the code and the form cannot raise them. With a ceiling of 2 requests per second and 100 per run, it cannot be used to overload a target. Only measure servers you run or have permission to test.',
    modeTitle: 'Mode',
    modeSimName: 'Simulation (default)',
    modeSimDesc: 'Zero network requests. Practise reading latency distribution and error rate on synthetic data.',
    modeProbeName: 'Self-measurement',
    modeProbeDesc: 'Send real requests to the specified target, with gaps in between.',
    targetCardTitle: 'Target',
    badgeBundled: 'Bundled',
    badgeCustom: 'Custom',
    targetUrlLabel: 'Target URL',
    applyTargetBtn: 'Use this URL',
    resetTargetBtn: 'Back to bundled',
    targetHint: 'Leave empty to measure the static file bundled with this page. Only http:// and https:// are accepted.',
    targetMsgCustom: 'Target switched.',
    targetMsgReset: 'Target reset to the bundled file.',
    conditionsTitle: 'Measurement conditions',
    limitLabel: 'Hard limits',
    limitText: '100 per run / concurrency 1 / 500 ms minimum gap (2 req/s max) / 120 per minute / 200 per host per session / stops at 3 min',
    intervalLabel: 'Interval',
    budgetLabel: 'Total requests',
    budgetHint: 'Capped at 100 in code',
    gateTitle: 'Requirements for self-measurement',
    ownCheck: 'I administer this target or have permission to measure it.',
    confirmLabel: 'Type TEST to confirm',
    gateWarn: 'The start conditions are not met.',
    startBtn: 'Start',
    stopBtn: 'Stop',
    resetBtn: 'Reset',
    reportBtn: 'Save report',
    stateIdle: 'Idle',
    sessionSuffix: '(session total {n})',
    stateRunning: 'Running',
    stateDone: 'Finished',
    statSent: 'Sent',
    statOk: 'OK',
    statErr: 'Failed',
    statP50: 'p50 latency',
    statP95: 'p95 latency',
    statElapsed: 'Elapsed',
    chartTitle: 'Latency distribution (x: ms, y: count)',
    logTitle: 'Run log',
    diffTitle: 'What changed from the original',
    diffColOld: 'Original',
    diffColNew: 'This version',
    diff1a: 'Any URL could be typed in and hit',
    diff1b: 'Still the same: any URL can be targeted',
    diff2a: '1–100000 requests per second, 200 in parallel',
    diff2b: '500 ms minimum gap (2 req/s max), concurrency 1, 100 per run',
    diff3a: 'Kept sending until manually stopped',
    diff3b: 'Stops on count, 3 min, 120 per minute, 200 per host per session',
    diff4a: 'Fired no-cors requests without reading responses',
    diff4b: 'Reads every response and stops after 3 consecutive failures',
    diff5a: 'CDN script plus inline onclick handlers',
    diff5b: 'No external dependencies, CSP, textContent only',
    diff6a: 'No input validation',
    diff6b: 'http/https only, URLs with credentials rejected',
    whyTitle: 'Where the safety actually lives',
    why1: 'Limits are frozen constants with no UI to raise them (2 req/s at most).',
    why2: 'Concurrency is always 1, so it cannot saturate a link or the browser.',
    why3: 'Every response is read, and repeated failures stop the run.',
    why4: 'It stops automatically when the tab is hidden.',
    why5: 'Simulation is the default and sends zero bytes.',
    footer: 'Only measure servers you run or have permission to test. Sending load to third parties violates unauthorised-access laws in most jurisdictions.',
    errUrlEmpty: 'Enter a URL.',
    errUrlInvalid: 'That is not a valid URL (example: http://127.0.0.1:8000/).',
    errScheme: 'Only http:// and https:// URLs are supported.',
    errCredentials: 'URLs must not contain a username or password.',
    errMixedContent: 'An https page cannot send to an http target (except localhost / 127.0.0.1). Open this page over http, or use an https target.',
    errTargetChanged: 'The target no longer matches the one the run started with.',
    errSessionCap: 'Session cap for this host (60 requests) reached.',
    errAuth: 'Tick the administrator box and type TEST.',
    errOrigin: 'Cannot send from this origin. Open the page over http(s).',
    logSim: 'Simulation: 0 network requests',
    logStart: 'Start: {url} / {n} requests / {ms} ms apart',
    logReq: 'GET {path} → {status} ({ms} ms)',
    logDone: 'Done: {n} sent / {e} failed',
    logStopLimit: 'Stopped: run budget reached',
    logStopUser: 'Stopped: user',
    logStopHidden: 'Stopped: tab hidden',
    logStopTime: 'Stopped: 3 min limit',
    logStopFail: 'Stopped: 3 consecutive failures',
    logNetworkHint: 'Hint: check the URL, the port, and the CORS header (Access-Control-Allow-Origin).',
    repTitle: 'Load test result',
    repMode: 'Mode',
    repTarget: 'Target',
    repTargetKind: 'Target type',
    repKindBundled: 'Bundled file (same origin)',
    repKindCustom: 'Specified URL',
    repSent: 'Requests sent',
    repFail: 'Failed',
    repP50: 'p50 latency',
    repP95: 'p95 latency',
    repNote: 'The rate limits are fixed in code (2 req/s at most).',
    repSynthetic: 'Simulation (0 requests, synthetic data)',
  },

  zh: {
    skip: '跳到正文',
    title: '负载测试沙盒',
    lede: '可以指定任意 URL 进行测量。发送速率上限为每秒 2 次，并发固定为 1。',
    noticeTitle: '这是测量工具，不是攻击工具',
    noticeBody: '速率上限是代码里的常量，表单无法抬高。最坏情况也只有每秒 2 次、单次 100 次，因此无法用于压垮目标。请只测量自己管理或已获许可的服务器。',
    modeTitle: '模式',
    modeSimName: '模拟（默认）',
    modeSimDesc: '零网络请求。用合成数据练习阅读延迟分布与错误率。',
    modeProbeName: '自测',
    modeProbeDesc: '向指定目标真实发送请求，并保持间隔。',
    targetCardTitle: '测量目标',
    badgeBundled: '随包',
    badgeCustom: '指定',
    targetUrlLabel: '目标 URL',
    applyTargetBtn: '使用此 URL',
    resetTargetBtn: '恢复默认',
    targetHint: '不填写则测量本页随包的静态文件。仅支持 http:// 与 https://。',
    targetMsgCustom: '目标已切换。',
    targetMsgReset: '目标已恢复为随包文件。',
    conditionsTitle: '测量条件',
    limitLabel: '硬上限',
    limitText: '单次 100 次 / 并发 1 / 最短 500 ms（每秒最多 2 次）/ 每分钟 120 次 / 每主机每会话 200 次 / 3 分钟自动结束',
    intervalLabel: '发送间隔',
    budgetLabel: '总请求数',
    budgetHint: '代码上限 100 次',
    gateTitle: '自测前提',
    ownCheck: '我是该目标的管理员，或已获得测量许可。',
    confirmLabel: '为确认请键入 TEST',
    gateWarn: '尚未满足开始条件。',
    startBtn: '开始',
    stopBtn: '停止',
    resetBtn: '重置',
    reportBtn: '保存报告',
    stateIdle: '待机',
    sessionSuffix: '（该主机累计 {n} 次）',
    stateRunning: '运行中',
    stateDone: '已完成',
    statSent: '已发送',
    statOk: '成功',
    statErr: '失败',
    statP50: 'p50 延迟',
    statP95: 'p95 延迟',
    statElapsed: '耗时',
    chartTitle: '延迟分布（横轴：毫秒，纵轴：次数）',
    logTitle: '运行日志',
    diffTitle: '与原版相比改了什么',
    diffColOld: '原实现',
    diffColNew: '本实现',
    diff1a: '可以输入任意网址并打过去',
    diff1b: '同样可以指定任意网址（保持原样）',
    diff2a: '每秒 1–100000 次，200 并发',
    diff2b: '最短间隔 500 ms（每秒最多 2 次）、并发 1、单次 100 次',
    diff3a: '不手动停止就一直发',
    diff3b: '按次数、3 分钟、每分钟 120 次、每主机 200 次自动结束',
    diff4a: '用 no-cors 不读响应地盲发',
    diff4b: '必读响应，连续 3 次失败即停',
    diff5a: 'CDN 脚本加内联 onclick',
    diff5b: '零外部依赖、CSP、DOM 只用 textContent',
    diff6a: '没有任何输入校验',
    diff6b: '仅允许 http/https，拒绝含用户名密码的 URL',
    whyTitle: '安全性体现在哪里',
    why1: '上限是冻结的常量，界面上没有抬高它的入口（最多每秒 2 次）。',
    why2: '并发恒为 1，不会打满线路或浏览器。',
    why3: '必读响应，连续失败会自动停止（不做盲发）。',
    why4: '标签页隐藏时自动停止。',
    why5: '默认是模拟模式，点击也不会发出一个字节。',
    footer: '请只测量自己管理或已获许可的服务器。向第三方施加负载在多数司法辖区构成非法访问类违法。',
    errUrlEmpty: '请输入 URL。',
    errUrlInvalid: 'URL 格式不正确（例如 http://127.0.0.1:8000/）。',
    errScheme: '仅支持 http:// 或 https:// 的 URL。',
    errCredentials: 'URL 中不能包含用户名或密码。',
    errMixedContent: 'https 页面无法向 http 目标发送（localhost / 127.0.0.1 例外）。请用 http 打开本页，或改用 https 目标。',
    errTargetChanged: '目标与开始运行时的设定不一致。',
    errSessionCap: '该主机已达到单会话上限（60 次）。',
    errAuth: '需要勾选管理员确认并键入 TEST。',
    errOrigin: '当前源无法实发（请通过 http/https 打开）。',
    logSim: '模拟：网络请求 0 次',
    logStart: '开始：{url} / {n} 次 / 间隔 {ms} ms',
    logReq: 'GET {path} → {status}（{ms} ms）',
    logDone: '结束：发送 {n} 次 / 失败 {e} 次',
    logStopLimit: '停止：达到本次设定次数',
    logStopUser: '停止：用户操作',
    logStopHidden: '停止：标签页隐藏',
    logStopTime: '停止：达到 3 分钟上限',
    logStopFail: '停止：连续 3 次失败',
    logNetworkHint: '提示：请检查 URL、端口与 CORS 头（Access-Control-Allow-Origin）。',
    repTitle: '负载测试结果',
    repMode: '模式',
    repTarget: '目标',
    repTargetKind: '目标类型',
    repKindBundled: '随包文件（同源）',
    repKindCustom: '指定 URL',
    repSent: '发送次数',
    repFail: '失败次数',
    repP50: 'p50 延迟',
    repP95: 'p95 延迟',
    repNote: '速率上限写死在代码里（最多每秒 2 次）。',
    repSynthetic: '模拟（0 次请求，合成数据）',
  },
};

let lang = 'ja';

function t(key, vars) {
  const table = I18N[lang] || I18N.ja;
  let s = table[key] != null ? table[key] : (I18N.ja[key] != null ? I18N.ja[key] : key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split('{' + k + '}').join(String(v));
    }
  }
  return s;
}

/* ---------------- DOM ---------------- */

const $ = (sel) => document.querySelector(sel);

const els = {
  langButtons: Array.from(document.querySelectorAll('.lang')),
  targetBadge: $('#targetBadge'),
  targetView: $('#targetView'),
  targetUrl: $('#targetUrl'),
  applyTargetBtn: $('#applyTargetBtn'),
  resetTargetBtn: $('#resetTargetBtn'),
  targetMsg: $('#targetMsg'),
  probePanel: $('#probePanel'),
  limitView: $('#limitView'),
  intervalRange: $('#intervalRange'),
  intervalView: $('#intervalView'),
  budgetNumber: $('#budgetNumber'),
  ownCheckbox: $('#ownCheckbox'),
  confirmText: $('#confirmText'),
  gateWarn: $('#gateWarn'),
  startBtn: $('#startBtn'),
  stopBtn: $('#stopBtn'),
  resetBtn: $('#resetBtn'),
  reportBtn: $('#reportBtn'),
  stateLine: $('#stateLine'),
  statSent: $('#statSent'),
  statOk: $('#statOk'),
  statErr: $('#statErr'),
  statP50: $('#statP50'),
  statP95: $('#statP95'),
  statElapsed: $('#statElapsed'),
  log: $('#log'),
  chart: $('#chart'),
};

/* ---------------- state ---------------- */

/* 同一オリジンへのセッション累計送信数（メモリ上のみ） */
const sessionCounts = new Map();

const target = { current: BUNDLED_TARGET };

const state = {
  mode: 'simulate',
  running: false,
  controller: null,
  sent: 0,
  ok: 0,
  err: 0,
  latencies: [],
  startedAt: 0,
  endedAt: 0,
  stopReason: null,
  synthetic: false,
  runBudget: 0,
  runInterval: 0,
  consecutiveErr: 0,
  runTarget: null,
  logEntries: [],
  phase: 'idle',   // 'idle' | 'running' | 'done'
};

/* 対象メッセージも翻訳キーで保持する */
const targetMsg = { key: null, kind: null };

/* ---------------- utils ---------------- */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function abortError() {
  try {
    return new DOMException('Aborted', 'AbortError');
  } catch (_) {
    const e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError());
    const id = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(abortError());
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const fmtMs = (v) => (v == null ? '–' : Math.round(v) + ' ms');

/* ログは「翻訳キー + 変数」で保持し、言語切替時に描き直す。 */
function log(key, vars, kind) {
  state.logEntries.push({ key, vars, kind, text: null });
  renderLog();
}

function logText(text, kind) {
  state.logEntries.push({ key: null, vars: null, kind, text });
  renderLog();
}

function renderLog() {
  const frag = document.createDocumentFragment();
  for (const entry of state.logEntries) {
    const li = document.createElement('li');
    li.textContent = entry.key ? t(entry.key, entry.vars) : entry.text; // innerHTML は使わない
    if (entry.kind) li.className = entry.kind;
    frag.appendChild(li);
  }
  els.log.textContent = '';
  els.log.appendChild(frag);
  els.log.scrollTop = els.log.scrollHeight;
}

/* ---------------- limit helpers ---------------- */

function limits() {
  return {
    intervalMs: clamp(Number(els.intervalRange.value) || SAFETY.DEFAULT_INTERVAL_MS,
      SAFETY.MIN_INTERVAL_MS, SAFETY.MAX_INTERVAL_MS),
    budget: clamp(Math.round(Number(els.budgetNumber.value) || SAFETY.MAX_REQUESTS_PER_RUN),
      1, SAFETY.MAX_REQUESTS_PER_RUN),
  };
}

/* ---------------- 対象の解析 ---------------- */

function parseTargetUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return { error: 'errUrlEmpty' };
  let url;
  try {
    url = new URL(text);
  } catch (_) {
    return { error: 'errUrlInvalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'errScheme' };
  if (url.username || url.password) return { error: 'errCredentials' };
  url.hash = '';
  return { url };
}

/* https ページ → http ターゲットは mixed content で遮断される（localhost 系を除く） */
function isMixedContentBlocked(url) {
  if (window.location.protocol !== 'https:') return false;
  if (url.protocol !== 'http:') return false;
  const host = url.hostname;
  return !(host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]');
}

/* ---------------- rate gate ---------------- */

function createGate(intervalMs) {
  return { intervalMs, last: 0, stamps: [] };
}

async function waitForSlot(gate, signal) {
  for (;;) {
    const now = performance.now();
    gate.stamps = gate.stamps.filter((s) => now - s < 60000);
    const sinceLast = gate.last === 0 ? Infinity : now - gate.last;
    const minuteBusy = gate.stamps.length >= SAFETY.MAX_REQUESTS_PER_MINUTE;
    if (!minuteBusy && sinceLast >= gate.intervalMs) return;
    const wait = minuteBusy
      ? Math.max(50, 60000 - (now - gate.stamps[0]) + 20)
      : Math.max(50, gate.intervalMs - sinceLast);
    await sleep(wait, signal);
  }
}

/* ---------------- 送信（唯一の外向き経路） ---------------- */

async function probeOnce(url, expectedOrigin, parentSignal) {
  // 実行中に静かに対象が差し替えられていないかを最終確認する
  if (url.origin !== expectedOrigin) throw new Error(t('errTargetChanged'));

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parentSignal) parentSignal.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), SAFETY.TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: url.origin === window.location.origin ? 'same-origin' : 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return { status: res.status, ok: res.ok, ms: performance.now() - t0 };
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
  }
}

/* ---------------- runners ---------------- */

async function runProbe(url, intervalMs, budget) {
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
    log('errOrigin', null, 'bad');
    return;
  }
  if (isMixedContentBlocked(url)) {
    log('errMixedContent', null, 'bad');
    return;
  }

  const gate = createGate(intervalMs);
  const deadline = performance.now() + SAFETY.MAX_RUN_MS;
  const origin = url.origin;

  log('logStart', { url: url.href, n: budget, ms: intervalMs });

  while (state.running && state.sent < budget) {
    if (performance.now() > deadline) {
      state.stopReason = 'time';
      break;
    }
    const used = sessionCounts.get(origin) || 0;
    if (used >= SAFETY.SESSION_CAP_PER_ORIGIN) {
      state.stopReason = 'limit';
      break;
    }

    try {
      await waitForSlot(gate, state.controller.signal);
    } catch (_) {
      break;
    }
    if (!state.running) break;

    try {
      const r = await probeOnce(url, origin, state.controller.signal); // 同時接続は常に 1
      state.sent++;
      sessionCounts.set(origin, used + 1);
      state.latencies.push(r.ms);
      if (r.ok) {
        state.ok++;
        state.consecutiveErr = 0;
      } else {
        state.err++;
        state.consecutiveErr++;
      }
      log('logReq', { path: url.pathname, status: r.status, ms: Math.round(r.ms) },
        r.ok ? 'ok' : 'bad');
    } catch (e) {
      if (e && e.name === 'AbortError' && !state.running) break;
      state.sent++;
      sessionCounts.set(origin, used + 1);
      state.err++;
      state.consecutiveErr++;
      log('logReq', {
        path: url.pathname,
        status: (e && e.name) || 'error',
        ms: Math.round(SAFETY.TIMEOUT_MS),
      }, 'bad');
      // 到達できない対象を延々と叩かない
      if (state.consecutiveErr >= SAFETY.MAX_CONSECUTIVE_ERRORS) {
        log('logNetworkHint', null, 'bad');
        state.stopReason = 'fail';
        break;
      }
    }

    gate.last = performance.now();
    gate.stamps.push(gate.last);
    render();

    if (state.sent >= budget) {
      state.stopReason = 'limit';
      break;
    }
  }
}

async function runSimulation(intervalMs, budget) {
  state.synthetic = true;
  log('logSim');
  const deadline = performance.now() + SAFETY.MAX_RUN_MS;
  let seed = 20261112;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const scale = intervalMs;

  while (state.running && state.sent < budget) {
    if (performance.now() > deadline) {
      state.stopReason = 'time';
      break;
    }
    try {
      await sleep(intervalMs, state.controller.signal);
    } catch (_) {
      break;
    }
    if (!state.running) break;

    const base = 60 + scale * 0.12;
    const jitter = Math.abs(rand() + rand() + rand() - 1.5) * base * 0.9;
    const ms = base + jitter;
    const failed = rand() < 0.06;
    state.sent++;
    state.latencies.push(ms);
    if (failed) state.err++;
    else state.ok++;
    log('logReq', {
      path: target.current.url.pathname,
      status: failed ? 'timeout' : 200,
      ms: Math.round(ms),
    }, failed ? 'bad' : 'ok');
    render();
  }
  if (state.sent >= budget) state.stopReason = 'limit';
}

/* ---------------- orchestration ---------------- */

function gateSatisfied() {
  if (state.mode === 'simulate') return true;
  const owns = els.ownCheckbox.checked;
  const typed = els.confirmText.value.trim().toUpperCase() === 'TEST';
  return owns && typed;
}

async function start() {
  if (state.running) return;
  if (state.mode === 'probe' && !gateSatisfied()) {
    els.gateWarn.hidden = false;
    return;
  }
  els.gateWarn.hidden = true;

  const runUrl = target.current.url;
  const used = sessionCounts.get(runUrl.origin) || 0;
  if (state.mode === 'probe' && used >= SAFETY.SESSION_CAP_PER_ORIGIN) {
    log('errSessionCap', null, 'bad');
    return;
  }

  const { intervalMs, budget } = limits();
  resetStats();
  state.runInterval = intervalMs;
  state.runBudget = budget;
  state.runTarget = target.current;
  state.running = true;
  state.controller = new AbortController();
  state.startedAt = performance.now();
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  setPhase('running');

  try {
    if (state.mode === 'probe') {
      await runProbe(runUrl, intervalMs, budget);
    } else {
      await runSimulation(intervalMs, budget);
    }
  } catch (e) {
    logText(String(e && e.message ? e.message : e), 'bad');
  } finally {
    finish();
  }
}

function finish() {
  state.running = false;
  state.endedAt = performance.now();
  if (state.controller) state.controller.abort();
  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;

  const budget = state.runBudget || 0;
  const reason = state.stopReason || (budget && state.sent >= budget ? 'limit' : 'user');
  if (reason === 'limit') log('logStopLimit');
  else if (reason === 'time') log('logStopTime');
  else if (reason === 'hidden') log('logStopHidden');
  else if (reason === 'fail') log('logStopFail');
  else log('logStopUser');
  log('logDone', { n: state.sent, e: state.err });

  setPhase('done');
  render();
}

function stop(reason) {
  if (!state.running) return;
  state.stopReason = reason || 'user';
  state.running = false;
  if (state.controller) state.controller.abort();
}

function resetStats() {
  state.sent = 0;
  state.ok = 0;
  state.err = 0;
  state.latencies = [];
  state.startedAt = 0;
  state.endedAt = 0;
  state.stopReason = null;
  state.synthetic = false;
  state.runBudget = 0;
  state.runInterval = 0;
  state.consecutiveErr = 0;
  state.runTarget = null;
  state.logEntries = [];
  els.log.textContent = '';
  render();
}

function resetAll() {
  if (state.running) stop('user');
  resetStats();
  setPhase('idle');
  els.gateWarn.hidden = true;
}

/* ---------------- view ---------------- */

function setPhase(phase) {
  state.phase = phase;
  renderStateLine();
}

/* 言語切替でも状態表示が失われないよう、phase から毎回組み立てる */
function renderStateLine() {
  if (state.phase === 'running') {
    const used = sessionCounts.get(target.current.origin) || 0;
    els.stateLine.textContent = t('stateRunning') + ' — ' + t('statSent') + ' ' + state.sent +
      ' / ' + t('statErr') + ' ' + state.err + ' ' + t('sessionSuffix', { n: used });
    els.stateLine.className = 'state is-run';
    return;
  }
  if (state.phase === 'done') {
    els.stateLine.textContent = t('stateDone') + ' — ' + t('statSent') + ' ' + state.sent +
      ' / ' + t('statErr') + ' ' + state.err;
    els.stateLine.className = 'state is-done';
    return;
  }
  els.stateLine.textContent = t('stateIdle');
  els.stateLine.className = 'state';
}

function setTargetMsg(key, kind) {
  targetMsg.key = key || null;
  targetMsg.kind = key ? (kind || null) : null;
  renderTargetMsg();
}

function renderTargetMsg() {
  const { key, kind } = targetMsg;
  els.targetMsg.hidden = !key;
  els.targetMsg.textContent = key ? t(key) : '';
  els.targetMsg.className = 'warn' + (kind ? ' ' + kind : '');
}

function renderTarget() {
  const cur = target.current;
  els.targetView.textContent = cur.url.href;
  els.targetBadge.textContent = cur.kind === 'custom' ? t('badgeCustom') : t('badgeBundled');
  els.targetBadge.className = 'badge' + (cur.kind === 'custom' ? ' is-custom' : '');
  els.resetTargetBtn.hidden = cur.kind !== 'custom';
}

function render() {
  els.statSent.textContent = state.sent;
  els.statOk.textContent = state.ok;
  els.statErr.textContent = state.err;
  els.statP50.textContent = fmtMs(percentile(state.latencies, 50));
  els.statP95.textContent = fmtMs(percentile(state.latencies, 95));
  const elapsed = state.startedAt ? ((state.endedAt || performance.now()) - state.startedAt) / 1000 : 0;
  els.statElapsed.textContent = elapsed.toFixed(1) + ' s';
  if (state.phase === 'running') renderStateLine();
  drawChart();
}

function drawChart() {
  const canvas = els.chart;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = 200;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 40, r: 12, t: 16, b: 28 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;

  ctx.strokeStyle = '#dfe5ec';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t + h);
  ctx.lineTo(pad.l + w, pad.t + h);
  ctx.stroke();

  if (!state.latencies.length) {
    ctx.fillStyle = '#8a99a8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('—', pad.l + 6, pad.t + h / 2);
    return;
  }

  const max = Math.max(...state.latencies);
  const buckets = 10;
  const width = Math.max(1, max / buckets);
  const counts = new Array(buckets).fill(0);
  for (const v of state.latencies) {
    const i = Math.min(buckets - 1, Math.floor(v / width));
    counts[i]++;
  }
  const peak = Math.max(1, ...counts);
  const barW = w / buckets;

  ctx.strokeStyle = '#eef2f7';
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l + w, pad.t);
  ctx.stroke();

  counts.forEach((c, i) => {
    const bh = (c / peak) * h;
    const x = pad.l + i * barW + barW * 0.15;
    const y = pad.t + h - bh;
    ctx.fillStyle = state.synthetic ? '#7fb2e0' : '#005bbc';
    ctx.fillRect(x, y, barW * 0.7, bh);
    if (c > 0 && barW > 22) {
      ctx.fillStyle = '#33414e';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(c), x + barW * 0.35, y - 3);
      ctx.textAlign = 'left';
    }
  });

  ctx.strokeStyle = '#cdd6e0';
  ctx.fillStyle = '#5b6b7a';
  ctx.font = '11px system-ui, sans-serif';
  [0, 0.5, 1].forEach((frac, i) => {
    const x = pad.l + w * frac;
    ctx.beginPath();
    ctx.moveTo(x, pad.t + h);
    ctx.lineTo(x, pad.t + h + 4);
    ctx.stroke();
    ctx.textAlign = i === 0 ? 'left' : (i === 1 ? 'center' : 'right');
    ctx.fillText(Math.round(max * frac) + ' ms', i === 0 ? x - 2 : (i === 1 ? x : x + 2), pad.t + h + 17);
  });
  ctx.textAlign = 'left';
  ctx.fillText(String(peak), pad.l - 32, pad.t + 4);
}

/* ---------------- report ---------------- */

function buildReport() {
  const intervalMs = state.runInterval || limits().intervalMs;
  const budget = state.runBudget || limits().budget;
  const runTarget = state.runTarget || target.current;
  const p50 = percentile(state.latencies, 50);
  const p95 = percentile(state.latencies, 95);
  const lines = [
    t('repTitle'),
    '='.repeat(28),
    `${t('repMode')}: ${state.synthetic ? t('repSynthetic') : t('modeProbeName')}`,
    `${t('repTarget')}: ${runTarget.url.href}`,
    `${t('repTargetKind')}: ${runTarget.kind === 'custom' ? t('repKindCustom') : t('repKindBundled')}`,
    `${t('repSent')}: ${state.sent}`,
    `${t('repFail')}: ${state.err}`,
    `${t('repP50')}: ${fmtMs(p50)}`,
    `${t('repP95')}: ${fmtMs(p95)}`,
    `${t('limitLabel')}: ${t('limitText')}`,
    '',
    `generated: ${new Date().toISOString()}`,
    `interval: ${intervalMs} ms / budget: ${budget}`,
    `session total for origin: ${sessionCounts.get(runTarget.origin) || 0}`,
    '',
    t('repNote'),
  ];
  return lines.join('\n');
}

function saveReport() {
  const blob = new Blob([buildReport()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'load-test-report.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------- 対象 UI ---------------- */

function applyTarget() {
  const parsed = parseTargetUrl(els.targetUrl.value);
  if (parsed.error) {
    setTargetMsg(parsed.error, 'is-bad');
    return;
  }
  const url = parsed.url;
  target.current = { url, origin: url.origin, kind: 'custom' };
  renderTarget();

  if (isMixedContentBlocked(url)) {
    setTargetMsg('errMixedContent', 'is-bad');
  } else {
    setTargetMsg('targetMsgCustom', 'is-ok');
  }
}

function resetTarget() {
  target.current = BUNDLED_TARGET;
  els.targetUrl.value = '';
  renderTarget();
  setTargetMsg('targetMsgReset', 'is-ok');
}

/* ---------------- i18n apply ---------------- */

function applyLanguage(next) {
  lang = I18N[next] ? next : 'ja';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.langButtons.forEach((b) => {
    b.classList.toggle('is-active', b.dataset.lang === lang);
  });
  els.limitView.textContent = t('limitText');
  els.intervalView.textContent = limits().intervalMs + ' ms';
  renderTarget();
  renderTargetMsg();
  renderLog();
  renderStateLine();
  render();
}

/* ---------------- wiring ---------------- */

els.langButtons.forEach((btn) => {
  btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.mode = radio.value;
    els.probePanel.hidden = state.mode !== 'probe';
    els.gateWarn.hidden = true;
  });
});

els.intervalRange.addEventListener('input', () => {
  els.intervalView.textContent = clamp(Number(els.intervalRange.value),
    SAFETY.MIN_INTERVAL_MS, SAFETY.MAX_INTERVAL_MS) + ' ms';
});

els.budgetNumber.addEventListener('change', () => {
  const v = clamp(Math.round(Number(els.budgetNumber.value) || 1), 1, SAFETY.MAX_REQUESTS_PER_RUN);
  els.budgetNumber.value = String(v);
});

els.ownCheckbox.addEventListener('change', () => { els.gateWarn.hidden = true; });
els.confirmText.addEventListener('input', () => { els.gateWarn.hidden = true; });

els.applyTargetBtn.addEventListener('click', () => { applyTarget(); });
els.targetUrl.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') applyTarget();
});
els.resetTargetBtn.addEventListener('click', () => { resetTarget(); });

els.startBtn.addEventListener('click', () => { start(); });
els.stopBtn.addEventListener('click', () => { stop('user'); });
els.resetBtn.addEventListener('click', () => { resetAll(); });
els.reportBtn.addEventListener('click', () => { saveReport(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.running) stop('hidden');
});

window.addEventListener('resize', () => { drawChart(); });

applyLanguage('ja');
