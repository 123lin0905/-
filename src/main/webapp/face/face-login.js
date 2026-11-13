/*
 * 人脸识别窗口（face_login.jsp）：
 *   1. GET /api/face/status：系统里还没有任何人脸 → 提示“请先进行人脸录入”，提供“先不录入人脸”（访客）与“账号密码登录后录入”；
 *   2. 有人脸 → 打开摄像头，连续取 3 帧合格人脸，特征平均后连同 antispoof / liveness 分数 POST /api/face/identify；
 *   3. 服务端比对成功即建立会话并返回跳转地址（养护员 → 养护工作台，管理员 → 管理页）；失败可重试或以访客进入；
 *   账号密码登录始终保留为备用入口。
 */
import { loadHuman, startCamera, stopCamera, analyze, averageEmbedding, mean, cameraProblem, api, sleep } from './face-core.js';

const CTX = (window.FACE_CTX && window.FACE_CTX.ctx) || '';
const $ = (id) => document.getElementById(id);
const video = $('fl-video'), cam = $('fl-cam'), stateEl = $('face-state'), card = $('face-login');
const FRAMES = 3, TIMEOUT_MS = 25000;
let running = false;

function setState(text, cls, camState) {
  stateEl.textContent = text;
  stateEl.className = 'fl-state' + (cls ? ' ' + cls : '');
  if (camState) { cam.dataset.state = camState; card.dataset.state = camState; }
}
function step(name) {
  const order = ['model', 'detect', 'live', 'match'];
  document.querySelectorAll('#fl-steps span').forEach((s) => s.classList.toggle('on', order.indexOf(s.dataset.s) <= order.indexOf(name)));
}
function show(id, on) { $(id).hidden = !on; }
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'ec-toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }

async function enterGuest() {
  try {
    const r = await api('POST', CTX + '/api/face/guest');
    location.href = r.redirect || (CTX + '/ecohome.jsp');
  } catch (e) { toast('无法以访客进入：' + e.message, true); }
}

function fail(text) {
  running = false;
  stopCamera(video);
  $('fl-icon').textContent = '🙁'; $('fl-icon').hidden = false;
  setState(text, 'err', 'fail');
  show('btn-retry', true); show('btn-start', false);
  $('btn-guest').textContent = '以访客身份进入';
}

async function recognize() {
  if (running) return;
  running = true;
  show('btn-retry', false); show('btn-start', false);
  $('fl-icon').hidden = true;
  const camErr = cameraProblem();
  if (camErr) { fail(camErr); return; }
  try {
    step('model'); setState('正在加载人脸识别模型…', null, 'scanning');
    await Promise.all([loadHuman((m) => setState(m, null, 'scanning')), startCamera(video)]);
  } catch (e) { console.warn(e); fail(e.message || String(e)); return; }

  step('detect'); setState('请正对摄像头，保持 1–2 秒…', null, 'scanning');
  const t0 = performance.now();
  const good = [];
  while (running && performance.now() - t0 < TIMEOUT_MS) {
    let r;
    try { r = await analyze(video); } catch (e) { console.warn(e); fail('人脸检测出错：' + (e.message || e)); return; }
    if (r.status !== 'ok') { good.length = 0; setState(r.message, 'warn', 'scanning'); await sleep(120); continue; }
    good.push(r.face);
    step('live'); setState('已检测到人脸，正在进行活体检测（' + good.length + '/' + FRAMES + '）…', null, 'scanning');
    if (good.length >= FRAMES) break;
    await sleep(150);
  }
  if (!running) return;
  if (good.length < FRAMES) { fail('25 秒内没有检测到清晰、单独的人脸。请调整光线和距离后重试。'); return; }

  step('match'); setState('正在比对身份…', null, 'scanning');
  const payload = { embedding: averageEmbedding(good.map((f) => f.embedding)), real: +mean(good.map((f) => f.real)).toFixed(3), live: +mean(good.map((f) => f.live)).toFixed(3) };
  try {
    const r = await api('POST', CTX + '/api/face/identify', payload);
    running = false;
    stopCamera(video);
    $('fl-icon').textContent = '✅'; $('fl-icon').hidden = false;
    setState('识别成功：' + r.user.display_name + '（' + r.user.group_label + '），正在进入…', 'ok', 'ok');
    window.__faceResult = r;
    setTimeout(() => { location.href = r.redirect; }, 900);
  } catch (e) {
    window.__faceResult = { ok: false, status: e.status, error: e.body && e.body.error };
    if (e.status === 409 && e.body && e.body.error === 'no_faces') { running = false; stopCamera(video); noFaces(); return; }
    fail(e.status === 503 ? '数据库暂不可用，人脸登录暂时无法使用，请稍后再试或以访客进入。' : (e.message || '识别失败'));
  }
}

function noFaces() {
  show('no-face-tip', true); show('btn-enroll-first', true); show('btn-start', false); show('btn-retry', false);
  $('btn-guest').textContent = '先不录入人脸';
  $('fl-icon').textContent = '🙂';
  setState('系统里还没有任何人脸录入，请先进行人脸录入。', 'warn', 'idle');
  card.dataset.state = 'no-faces';
}

$('btn-guest').addEventListener('click', () => { running = false; stopCamera(video); enterGuest(); });
$('btn-retry').addEventListener('click', () => recognize());
$('btn-start').addEventListener('click', () => recognize());

(async function init() {
  let st;
  try { st = await api('GET', CTX + '/api/face/status'); }
  catch (e) {
    setState(e.status === 503 ? '数据库暂不可用，人脸登录暂时无法使用。可以先以访客身份浏览，或稍后再试。' : '无法连接服务器：' + e.message, 'err', 'fail');
    card.dataset.state = 'error';
    return;
  }
  if (!st.enrolled) { noFaces(); return; }
  $('btn-guest').textContent = '以访客身份进入';
  if (window.FACE_CTX && window.FACE_CTX.autoStart === false) {
    setState('您已退出登录。点击“开始人脸识别”重新登录，或以访客身份浏览。', null, 'idle');
    show('btn-start', true);
    card.dataset.state = 'ready';
    return;
  }
  recognize();
})();
