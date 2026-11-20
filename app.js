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
    historyTitle: '実行履歴と比較',
    historyHint: '実行するたびに記録され、このブラウザ内に保存されます（実測モードのみ）。下の「まとめ方」と「ホスト」で絞り込めます。',
    groupByLabel: 'まとめ方',
    groupBatch: 'N 回ごとに分ける',
    groupTime: '日時で分ける（近い・遠い）',
    groupHost: 'ホストで分ける',
    groupNone: 'まとめない',
    batchSizeLabel: '区切り',
    batchUnit: '回ごと',
    hostFilterLabel: 'ホスト',
    hostAll: 'すべて',
    clearHistoryBtn: '履歴を消す',
    clearConfirm: 'このブラウザに保存された実行履歴をすべて消します。よろしいですか？',
    historyEmpty: 'まだ記録がありません。実測モードで 1 回実行すると、ここに残ります。',
    groupCount: '{n} 件',
    groupP50: 'p50 中央値',
    groupP95: 'p95 中央値',
    groupErr: '失敗率',
    batchLabel: '新しい順 {from}–{to} 回目',
    bucketToday: '今日',
    bucketWeek: '直近 7 日',
    bucketMonth: '直近 30 日',
    bucketOlder: 'それ以前',
    compareTitle: '比較',
    comparePickA: '上の一覧から 2 つ選ぶと、差分を表示します。',
    compareNoPrev: '比較できる過去の実行が 2 件以上たまると、ここに差分が出ます。',
    compareBase: '基準',
    compareTarget: '比較',
    cmpMetric: '指標',
    cmpDelta: '差分',
    compareP50: 'p50',
    compareP95: 'p95',
    compareMax: '最大',
    compareFail: '失敗率',
    compareVerdictBetter: '改善',
    compareVerdictWorse: '悪化',
    compareVerdictSame: 'ほぼ同じ',
    cmpFaster: '速くなりました',
    cmpSlower: '遅くなりました',
    cmpInsufficient: '数値がそろっていないため判定できません。',
    cmpMeta: '基準: {a}（{n1} 回 / {i1} ms 間隔） ／ 比較: {b}（{n2} 回 / {i2} ms 間隔）',
    compareDifferentHost: '対象ホストが異なります。ネットワーク経路も違うため、数値の単純比較は避けてください。',
    colTime: '日時',
    colHost: 'ホスト',
    colP50: 'p50',
    colP95: 'p95',
    colErr: '失敗率',
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
    historyTitle: 'Run history and comparison',
    historyHint: 'Every run is recorded and kept in this browser (real measurements only). Narrow it down with the grouping and host filters.',
    groupByLabel: 'Group by',
    groupBatch: 'Batches of N runs',
    groupTime: 'Date (recent / old)',
    groupHost: 'Host',
    groupNone: 'No grouping',
    batchSizeLabel: 'Batch size',
    batchUnit: 'runs',
    hostFilterLabel: 'Host',
    hostAll: 'All',
    clearHistoryBtn: 'Clear history',
    clearConfirm: 'Delete all run history stored in this browser?',
    historyEmpty: 'Nothing recorded yet. Run once in self-measurement mode and it will appear here.',
    groupCount: '{n} runs',
    groupP50: 'p50 median',
    groupP95: 'p95 median',
    groupErr: 'Fail rate',
    batchLabel: 'Newest first, {from}–{to}',
    bucketToday: 'Today',
    bucketWeek: 'Last 7 days',
    bucketMonth: 'Last 30 days',
    bucketOlder: 'Older',
    compareTitle: 'Comparison',
    comparePickA: 'Pick two runs above to see the difference.',
    compareNoPrev: 'Once you have at least two runs, the difference appears here.',
    compareBase: 'Base',
    compareTarget: 'Compare',
    cmpMetric: 'Metric',
    cmpDelta: 'Delta',
    compareP50: 'p50',
    compareP95: 'p95',
    compareMax: 'Max',
    compareFail: 'Fail rate',
    compareVerdictBetter: 'Improved',
    compareVerdictWorse: 'Regressed',
    compareVerdictSame: 'About the same',
    cmpFaster: 'faster',
    cmpSlower: 'slower',
    cmpInsufficient: 'Not enough numbers to judge.',
    cmpMeta: 'Base: {a} ({n1} req / {i1} ms gap) / Compare: {b} ({n2} req / {i2} ms gap)',
    compareDifferentHost: 'The hosts differ, so the network path differs too. Avoid comparing the numbers directly.',
    colTime: 'Time',
    colHost: 'Host',
    colP50: 'p50',
    colP95: 'p95',
    colErr: 'Fail',
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
    historyTitle: '运行历史与对比',
    historyHint: '每次运行都会记录，并保存在本浏览器内（仅实测模式）。可用下方向「汇总方式」与「主机」筛选。',
    groupByLabel: '汇总方式',
    groupBatch: '按 N 次一组',
    groupTime: '按日期（近 / 远）',
    groupHost: '按主机',
    groupNone: '不汇总',
    batchSizeLabel: '每组',
    batchUnit: '次',
    hostFilterLabel: '主机',
    hostAll: '全部',
    clearHistoryBtn: '清除历史',
    clearConfirm: '将删除本浏览器中保存的全部运行历史，确定吗？',
    historyEmpty: '还没有记录。用实测模式跑一次就会出现在这里。',
    groupCount: '{n} 次',
    groupP50: 'p50 中位数',
    groupP95: 'p95 中位数',
    groupErr: '失败率',
    batchLabel: '由新到旧 第 {from}–{to} 次',
    bucketToday: '今天',
    bucketWeek: '近 7 天',
    bucketMonth: '近 30 天',
    bucketOlder: '更早',
    compareTitle: '对比',
    comparePickA: '在上方列表中选择 2 条，即可显示差异。',
    compareNoPrev: '累积 2 条以上记录后，这里会显示差异。',
    compareBase: '基准',
    compareTarget: '对比',
    cmpMetric: '指标',
    cmpDelta: '差值',
    compareP50: 'p50',
    compareP95: 'p95',
    compareMax: '最大值',
    compareFail: '失败率',
    compareVerdictBetter: '改善',
    compareVerdictWorse: '变差',
    compareVerdictSame: '基本持平',
    cmpFaster: '变快了',
    cmpSlower: '变慢了',
    cmpInsufficient: '数值不全，无法判定。',
    cmpMeta: '基准：{a}（{n1} 次 / 间隔 {i1} ms）／ 对比：{b}（{n2} 次 / 间隔 {i2} ms）',
    compareDifferentHost: '两个目标主机不同，网络路径也不同，请不要直接比较数值。',
    colTime: '时间',
    colHost: '主机',
    colP50: 'p50',
    colP95: 'p95',
    colErr: '失败率',
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
  groupBy: $('#groupBy'),
  batchSize: $('#batchSize'),
  batchSizeWrap: $('#batchSizeWrap'),
  hostFilter: $('#hostFilter'),
  clearHistoryBtn: $('#clearHistoryBtn'),
  historyEmpty: $('#historyEmpty'),
  historyList: $('#historyList'),
  comparePanel: $('#comparePanel'),
  compareHint: $('#compareHint'),
  compareBody: $('#compareBody'),
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
  recordRun();
  render();
  renderHistory();
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

    // 最上位の棒は上端に接するため、外に出すと読めなくなる。
    // 高さが足りる棒は内側に白文字、低い棒は外側に濃い文字で置く。
    if (c > 0 && barW > 22) {
      const inside = bh > 18;
      ctx.fillStyle = inside ? '#ffffff' : '#33414e';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(c), x + barW * 0.35, inside ? y + 13 : y - 4);
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

/* ---------------- 実行履歴 ---------------- */

const HISTORY_KEY = 'lts.history.v1';
const HISTORY_MAX = 200;

const history = {
  read() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY); // ブラウザ内のみ。外部送信はしない
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((r) => r && typeof r.at === 'number') : [];
    } catch (_) {
      return [];
    }
  },
  write(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (_) {
      /* 容量超過やプライベートモードでは保存できない。記録は諦めて続行する */
    }
  },
  add(rec) {
    const list = this.read();
    list.unshift(rec);
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    this.write(list);
  },
  remove(id) {
    this.write(this.read().filter((r) => r.id !== id));
  },
  clear() {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (_) { /* noop */ }
  },
};

const groupBy = { mode: 'batch', batchSize: 10, host: 'all' };
const compare = { sel: [], initialized: false };

function newRunId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'r' + Date.now().toString(36) + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function median(values) {
  const v = values.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function recordRun() {
  if (state.synthetic || state.mode !== 'probe' || state.sent === 0) return;
  const runTarget = state.runTarget || target.current;
  const id = newRunId();
  history.add({
    id,
    at: Date.now(),
    origin: runTarget.origin,
    url: runTarget.url.href,
    kind: runTarget.kind,
    p50: percentile(state.latencies, 50),
    p95: percentile(state.latencies, 95),
    max: state.latencies.length ? Math.max(...state.latencies) : null,
    sent: state.sent,
    ok: state.ok,
    err: state.err,
    elapsedMs: Math.round((state.endedAt || performance.now()) - state.startedAt),
    intervalMs: state.runInterval,
    budget: state.runBudget,
  });

  // 直前に同じホストを測っていれば、それを基準として自動で並べる
  const prevSameHost = history.read().find((r) => r.id !== id && r.origin === runTarget.origin);
  compare.sel = prevSameHost ? [id, prevSameHost.id] : [id];
  compare.initialized = true;
}

function aggregate(runs) {
  const sent = runs.reduce((a, r) => a + (r.sent || 0), 0);
  const err = runs.reduce((a, r) => a + (r.err || 0), 0);
  return {
    count: runs.length,
    p50: median(runs.map((r) => r.p50)),
    p95: median(runs.map((r) => r.p95)),
    errRate: sent ? (err / sent) * 100 : null,
    from: Math.min(...runs.map((r) => r.at)),
    to: Math.max(...runs.map((r) => r.at)),
  };
}

function sameLocalDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/* まとめ方: 10 回ごと / 日時（近い・遠い）/ ホストごと / まとめない */
function groupRuns(runs) {
  if (!runs.length) return [];

  if (groupBy.mode === 'none') {
    return [{ key: 'all', labelKey: null, labelText: null, runs }];
  }

  if (groupBy.mode === 'host') {
    const map = new Map();
    for (const r of runs) {
      if (!map.has(r.origin)) map.set(r.origin, []);
      map.get(r.origin).push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => Math.max(...b[1].map((r) => r.at)) - Math.max(...a[1].map((r) => r.at)))
      .map(([origin, rs]) => ({ key: 'h:' + origin, labelKey: null, labelText: origin, runs: rs }));
  }

  if (groupBy.mode === 'time') {
    const now = Date.now();
    const DAY = 86400000;
    const buckets = {
      bucketToday: [],
      bucketWeek: [],
      bucketMonth: [],
      bucketOlder: [],
    };
    for (const r of runs) {
      const age = now - r.at;
      if (sameLocalDay(r.at, now)) buckets.bucketToday.push(r);
      else if (age < 7 * DAY) buckets.bucketWeek.push(r);
      else if (age < 30 * DAY) buckets.bucketMonth.push(r);
      else buckets.bucketOlder.push(r);
    }
    return ['bucketToday', 'bucketWeek', 'bucketMonth', 'bucketOlder']
      .filter((k) => buckets[k].length)
      .map((k) => ({ key: 't:' + k, labelKey: k, labelText: null, runs: buckets[k] }));
  }

  // batch: 新しい順に N 件ずつ
  const out = [];
  const size = Math.max(1, groupBy.batchSize | 0);
  for (let i = 0; i < runs.length; i += size) {
    const chunk = runs.slice(i, i + size);
    out.push({
      key: 'b:' + i,
      labelKey: 'batchLabel',
      labelVars: { from: i + 1, to: i + chunk.length },
      labelText: null,
      runs: chunk,
    });
  }
  return out;
}

function fmtClock(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  if (sameLocalDay(ts, Date.now())) return p(d.getHours()) + ':' + p(d.getMinutes());
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fmtDelta(base, next) {
  if (base == null || next == null) return { text: '–', cls: '' };
  const diff = next - base;
  const pct = base === 0 ? null : (diff / base) * 100;
  const abs = Math.abs(diff);
  const same = abs < 0.05;
  const sign = same ? '±' : (diff > 0 ? '+' : '−');
  // 1 ms 未満の差は丸めると 0 になり、% と食い違って見えるため小数で出す
  const num = same ? '0' : (abs < 10 ? abs.toFixed(1) : String(Math.round(abs)));
  const pctText = pct == null ? '' : ' (' + (same ? '0.0' : sign + Math.abs(pct).toFixed(1)) + '%)';
  const text = sign + num + ' ms' + pctText;
  return { text, cls: Math.abs(diff) < 1 ? '' : (diff < 0 ? 'is-better' : 'is-worse'), diff };
}

function renderHistory() {
  const all = history.read();

  // ホスト候補を更新（現在の対象も含める）
  const origins = Array.from(new Set(all.map((r) => r.origin)));
  els.hostFilter.textContent = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = t('hostAll');
  els.hostFilter.appendChild(optAll);
  for (const o of origins) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    els.hostFilter.appendChild(opt);
  }
  els.hostFilter.value = origins.includes(groupBy.host) ? groupBy.host : 'all';
  groupBy.host = els.hostFilter.value;

  const runs = groupBy.host === 'all' ? all : all.filter((r) => r.origin === groupBy.host);
  els.historyEmpty.hidden = runs.length > 0;

  // 初回だけ「直近 2 件」を自動選択して差分を出す
  if (!compare.initialized && runs.length >= 2) {
    compare.sel = [runs[0].id, runs[1].id];
    compare.initialized = true;
  }
  compare.sel = compare.sel.filter((id) => runs.some((r) => r.id === id));

  els.historyList.textContent = '';
  const groups = groupRuns(runs);

  if (groups.length) {
    const headRow = document.createElement('div');
    headRow.className = 'run-head';
    [t('colTime'), t('colHost'), t('colP50'), t('colP95'), t('colErr')].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      headRow.appendChild(span);
    });
    els.historyList.appendChild(headRow);
  }

  for (const g of groups) {
    const agg = aggregate(g.runs);

    const box = document.createElement('div');
    box.className = 'group';

    const label = g.labelText || (g.labelKey ? t(g.labelKey, g.labelVars) : '');
    const parts = [
      t('groupCount', { n: agg.count }),
      t('groupP50') + ' ' + fmtMs(agg.p50),
      t('groupP95') + ' ' + fmtMs(agg.p95),
      t('groupErr') + ' ' + (agg.errRate == null ? '–' : agg.errRate.toFixed(0) + '%'),
    ];

    // まとめない場合は見出しを出さず、集計だけを 1 行で添える
    const head = document.createElement('div');
    head.className = 'group-head';
    if (label) {
      const name = document.createElement('span');
      name.className = 'group-name';
      name.textContent = label;
      head.appendChild(name);
    }
    const meta = document.createElement('span');
    meta.className = 'group-meta';
    meta.textContent = parts.join(' ・ ');
    head.appendChild(meta);

    box.appendChild(head);

    const rows = document.createElement('div');
    rows.className = 'rows';

    for (const r of g.runs) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'run-row' + (compare.sel.includes(r.id) ? ' is-sel' : '');
      row.dataset.id = r.id;
      row.setAttribute('aria-pressed', compare.sel.includes(r.id) ? 'true' : 'false');

      const cells = [
        { cls: 'run-time', text: fmtClock(r.at) },
        { cls: 'run-host', text: r.origin.replace(/^https?:\/\//, '') },
        { cls: 'run-num', text: fmtMs(r.p50) },
        { cls: 'run-num', text: fmtMs(r.p95) },
        { cls: 'run-err' + (r.err > 0 ? ' is-bad' : ''), text: r.sent ? Math.round((r.err / r.sent) * 100) + '%' : '–' },
      ];
      for (const c of cells) {
        const span = document.createElement('span');
        span.className = c.cls;
        span.textContent = c.text;
        row.appendChild(span);
      }
      rows.appendChild(row);
    }

    box.appendChild(rows);
    els.historyList.appendChild(box);
  }

  renderCompare(runs);
}

function renderCompare(runs) {
  const body = els.compareBody;
  body.textContent = '';
  els.comparePanel.hidden = runs.length === 0;

  const picks = compare.sel.map((id) => runs.find((r) => r.id === id)).filter(Boolean);
  if (picks.length < 2) {
    els.compareHint.hidden = false;
    els.compareHint.textContent = runs.length < 2 ? t('compareNoPrev') : t('comparePickA');
    return;
  }
  els.compareHint.hidden = true;

  const [a, b] = picks; // a = 基準（古い方） / b = 比較（新しい方）
  const base = a.at <= b.at ? a : b;
  const next = a.at <= b.at ? b : a;

  const table = document.createElement('table');
  table.className = 'cmp';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const heads = [
    { label: t('cmpMetric'), when: null },
    { label: t('compareBase'), when: fmtClock(base.at) },
    { label: t('compareTarget'), when: fmtClock(next.at) },
    { label: t('cmpDelta'), when: null },
  ];
  heads.forEach((h, i) => {
    const th = document.createElement('th');
    if (i === 0) th.scope = 'col';
    const name = document.createElement('span');
    name.textContent = h.label;
    th.appendChild(name);
    if (h.when) {
      const when = document.createElement('span');
      when.className = 'cmp-when';
      when.textContent = h.when;
      th.appendChild(when);
    }
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const rowsSpec = [
    { name: t('compareP50'), a: base.p50, b: next.p50, unit: 'ms' },
    { name: t('compareP95'), a: base.p95, b: next.p95, unit: 'ms' },
    { name: t('compareMax'), a: base.max, b: next.max, unit: 'ms' },
  ];

  for (const spec of rowsSpec) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = spec.name;
    tr.appendChild(th);

    const tdA = document.createElement('td');
    tdA.textContent = fmtMs(spec.a);
    tr.appendChild(tdA);

    const tdB = document.createElement('td');
    tdB.textContent = fmtMs(spec.b);
    tr.appendChild(tdB);

    const tdD = document.createElement('td');
    const d = fmtDelta(spec.a, spec.b);
    tdD.textContent = d.text;
    tdD.className = d.cls;
    tr.appendChild(tdD);

    tbody.appendChild(tr);
  }

  // 失敗率
  const trE = document.createElement('tr');
  const thE = document.createElement('th');
  thE.scope = 'row';
  thE.textContent = t('compareFail');
  trE.appendChild(thE);
  const rate = (r) => (r.sent ? (r.err / r.sent) * 100 : null);
  const ra = rate(base);
  const rb = rate(next);
  const tdEa = document.createElement('td');
  tdEa.textContent = ra == null ? '–' : ra.toFixed(0) + '%';
  trE.appendChild(tdEa);
  const tdEb = document.createElement('td');
  tdEb.textContent = rb == null ? '–' : rb.toFixed(0) + '%';
  trE.appendChild(tdEb);
  const tdEd = document.createElement('td');
  if (ra == null || rb == null) {
    tdEd.textContent = '–';
  } else {
    const diff = rb - ra;
    tdEd.textContent = (diff > 0 ? '+' : (diff < 0 ? '−' : '±')) + Math.abs(diff).toFixed(0) + ' pt';
    tdEd.className = Math.abs(diff) < 1 ? '' : (diff < 0 ? 'is-better' : 'is-worse');
  }
  trE.appendChild(tdEd);
  tbody.appendChild(trE);

  table.appendChild(tbody);
  const scroll = document.createElement('div');
  scroll.className = 'cmp-scroll';
  scroll.appendChild(table);
  body.appendChild(scroll);

  // 判定
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  const dp50 = (base.p50 != null && next.p50 != null) ? (next.p50 - base.p50) / base.p50 * 100 : null;
  if (dp50 == null) {
    verdict.textContent = t('cmpInsufficient');
    verdict.classList.add('is-same');
  } else if (Math.abs(dp50) <= 5) {
    verdict.textContent = t('compareVerdictSame') + ' （p50 ' + (dp50 >= 0 ? '+' : '−') + Math.abs(dp50).toFixed(1) + '%）';
    verdict.classList.add('is-same');
  } else if (dp50 < 0) {
    verdict.textContent = t('compareVerdictBetter') + ' — p50 ' + Math.abs(dp50).toFixed(1) + '% ' + t('cmpFaster');
    verdict.classList.add('is-better');
  } else {
    verdict.textContent = t('compareVerdictWorse') + ' — p50 ' + dp50.toFixed(1) + '% ' + t('cmpSlower');
    verdict.classList.add('is-worse');
  }
  body.appendChild(verdict);

  // ホストが違う場合は単純比較を戒める
  if (base.origin !== next.origin) {
    const warn = document.createElement('p');
    warn.className = 'warn is-bad';
    warn.textContent = t('compareDifferentHost');
    body.appendChild(warn);
  }

  const meta = document.createElement('p');
  meta.className = 'hint';
  meta.textContent = t('cmpMeta', {
    a: base.url, b: next.url,
    n1: base.sent, n2: next.sent,
    i1: base.intervalMs, i2: next.intervalMs,
  });
  body.appendChild(meta);
}

function toggleCompare(id) {
  const i = compare.sel.indexOf(id);
  if (i >= 0) {
    compare.sel.splice(i, 1);
  } else {
    compare.sel.push(id);
    if (compare.sel.length > 2) compare.sel.shift();
  }
  compare.initialized = true;
  renderHistory();
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
  renderHistory();
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

els.groupBy.addEventListener('change', () => {
  groupBy.mode = els.groupBy.value;
  els.batchSizeWrap.hidden = groupBy.mode !== 'batch';
  renderHistory();
});

els.batchSize.addEventListener('change', () => {
  groupBy.batchSize = clamp(Number(els.batchSize.value) || 10, 1, 100);
  renderHistory();
});

els.hostFilter.addEventListener('change', () => {
  groupBy.host = els.hostFilter.value;
  compare.sel = [];
  compare.initialized = false;
  renderHistory();
});

els.clearHistoryBtn.addEventListener('click', () => {
  if (!window.confirm(t('clearConfirm'))) return;
  history.clear();
  compare.sel = [];
  compare.initialized = false;
  renderHistory();
});

els.historyList.addEventListener('click', (ev) => {
  const row = ev.target.closest('.run-row');
  if (!row || !row.dataset.id) return;
  toggleCompare(row.dataset.id);
});

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
