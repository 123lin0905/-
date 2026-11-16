/*
 * 人脸录入（face_enroll.jsp）：按 5 个角度提示逐帧采集，至少 3 帧合格即提交 POST /api/face/enroll（服务端多帧平均后追加保存）。
 * 人脸长期保存：录入只会追加，不会覆盖旧记录；只有管理员能删除（DELETE /api/face/profiles/{id}，按返回的 can_delete 显示按钮）。
 * 管理员可在“录入给”里选择其管理范围内的账号（GET /api/face/accounts）；从“人脸信息管理”跳过来时带 ?account_id= 预先选中。
 */
import { loadHuman, startCamera, stopCamera, analyze, mean, thumbnail, api, sleep, cameraProblem } from './face-core.js';

const C = window.FACE_CTX || {};
const CTX = C.ctx || '';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const video = $('fe-video');
const PROMPTS = ['请正视摄像头', '请把头稍微向左转', '请把头稍微向右转', '请稍微抬头', '请稍微低头'];
const MIN_FRAMES = 3, PER_PROMPT_MS = 5000;
let busy = false, cancelled = false;

function status(msg, cls) { const s = $('enroll-status'); s.textContent = msg; s.className = 'fe-status' + (cls ? ' ' + cls : ''); }
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'ec-toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }
function target() { const v = $('target-select').value; return v ? +v : null; }

async function loadAccounts() {
  if (!C.isAdmin) return;
  const sel = $('target-select');
  try {
    const r = await api('GET', CTX + '/api/face/accounts');
    for (const a of r.items) {
      if (a.is_me || !a.can_enroll) continue;
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.role_label + '：' + (a.display_name || a.username) + '（' + a.username + (a.maintainer_name ? ' · ' + a.maintainer_name : '') + '）· 已录 ' + a.face_count + ' 条';
      sel.appendChild(o);
    }
  } catch (e) { toast('读取账号列表失败：' + e.message, true); }
  if (C.preselect) {
    if ([...sel.options].some((o) => o.value === String(C.preselect))) sel.value = String(C.preselect);
    else if (C.preselect !== C.myId) toast('无权为该账号录入人脸，已改为给自己录入', true);
  }
}

function renderList(r) {
  const acc = r.account || {};
  $('profile-account').textContent = '— ' + (acc.display_name || '') + '（' + (acc.username || '') + '）';
  const ul = $('profile-list');
  if (!r.items.length) { ul.innerHTML = '<li class="ec-muted" id="profile-empty">还没有录入人脸</li>'; return; }
  // 删除按钮只给有权限的管理员；养护人员的人脸长期保存，如需更换请联系管理员
  ul.innerHTML = r.items.map((p) =>
    '<li data-id="' + p.id + '">' + (p.thumbnail ? '<img alt="人脸缩略图" src="' + esc(p.thumbnail) + '">' : '<span class="fe-noimg">🙂</span>') +
    '<div class="fe-meta"><b>#' + p.id + '</b> · ' + p.frames + ' 帧平均<br><span class="ec-muted">' + esc(p.created_at) + ' · 录入人 ' + esc(p.created_by || '') + '</span></div>' +
    (r.can_delete ? '<button class="ec-btn ec-btn-sm ec-btn-danger profile-del" type="button" data-id="' + p.id + '">删除</button>' : '') + '</li>').join('');
  ul.querySelectorAll('.profile-del').forEach((b) => b.addEventListener('click', () => del(+b.dataset.id)));
}

async function refresh() {
  const t = target();
  try { renderList(await api('GET', CTX + '/api/face/profiles' + (t ? '?account_id=' + t : ''))); }
  catch (e) { $('profile-list').innerHTML = '<li class="ec-muted">' + esc(e.message) + '</li>'; }
}

async function del(id) {
  if (!confirm('确定删除人脸记录 #' + id + ' 吗？人脸数据长期保存，删除后无法恢复，该记录不能再用于刷脸登录。')) return;
  try { renderList(await api('DELETE', CTX + '/api/face/profiles/' + id)); toast('已删除 #' + id); }
  catch (e) { toast('删除失败：' + e.message, true); }
}

function dots(states) { document.querySelectorAll('#fe-dots i').forEach((d, i) => { d.className = states[i] || ''; }); }

async function enroll() {
  if (busy) return;
  const camErr = cameraProblem();
  if (camErr) { status(camErr, 'err'); return; }
  busy = true; cancelled = false;
  $('btn-enroll').disabled = true; $('btn-cancel').hidden = false; $('target-select').disabled = true;
  const states = [];
  dots(states);
  try {
    status('正在加载模型并打开摄像头…');
    await Promise.all([loadHuman((m) => status(m)), startCamera(video)]);
    const frames = [];
    let thumb = null;
    for (let i = 0; i < PROMPTS.length && !cancelled; i++) {
      $('fe-prompt').textContent = (i + 1) + '/' + PROMPTS.length + ' ' + PROMPTS[i];
      await sleep(700);
      const t0 = performance.now();
      let got = null;
      while (!cancelled && performance.now() - t0 < PER_PROMPT_MS) {
        const r = await analyze(video);
        if (r.status === 'ok') { got = r.face; break; }
        status(r.message);
        await sleep(120);
      }
      states[i] = got ? 'done' : 'skip';
      dots(states);
      if (got) {
        frames.push(got);
        if (!thumb) thumb = thumbnail(video, got.box);
        status('已采集 ' + frames.length + ' 帧');
      }
    }
    if (cancelled) { status('已取消'); return; }
    if (frames.length < MIN_FRAMES) { status('只采集到 ' + frames.length + ' 帧合格人脸（至少需要 ' + MIN_FRAMES + ' 帧），请调整光线 / 距离后重试。', 'err'); return; }
    $('fe-prompt').textContent = '正在保存…';
    const body = { embeddings: frames.map((f) => f.embedding), real: +mean(frames.map((f) => f.real)).toFixed(3), live: +mean(frames.map((f) => f.live)).toFixed(3), thumbnail: thumb };
    if (target()) body.account_id = target();
    const r = await api('POST', CTX + '/api/face/enroll', body);
    renderList(r);
    window.__enrollResult = r;
    status('录入成功：' + r.frames + ' 帧取平均，已保存为 #' + r.id + '（长期保存，不会因退出登录而删除）。下次打开系统即可刷脸登录。', 'ok');
    $('fe-prompt').textContent = '✅ 录入完成';
  } catch (e) {
    console.warn(e);
    window.__enrollResult = { ok: false, status: e.status, error: e.body && e.body.error };
    status(e.status === 503 ? '数据库暂不可用，未保存，请稍后再试。' : '录入失败：' + (e.message || e), 'err');
    $('fe-prompt').textContent = '录入未完成';
  } finally {
    stopCamera(video);
    busy = false;
    $('btn-enroll').disabled = false; $('btn-cancel').hidden = true; $('target-select').disabled = false;
  }
}

$('btn-enroll').addEventListener('click', enroll);
$('btn-cancel').addEventListener('click', () => { cancelled = true; });
$('target-select').addEventListener('change', refresh);
loadAccounts().then(refresh);
// 进入页面就开始在后台加载模型，点“开始录入”时更快
loadHuman().catch((e) => console.warn('模型预加载失败', e));
