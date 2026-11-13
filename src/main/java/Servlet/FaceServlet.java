package Servlet;

import DB.Jdbc;
import DB.JdbcAccountStore;
import DB.JdbcFaceStore;
import DB.MiniJson;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.FaceConfig;
import security.FaceMatcher;
import security.Roles;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 人脸登录接口 /api/face/*（比对全部在服务端完成，特征向量从不下发到前端）：
 * <pre>
 * GET    /api/face/status                 公开：系统里是否已有人脸录入（只返回是否，不返回数量以外的信息）
 * POST   /api/face/identify               公开：{embedding:[…], real, live} → 识别成功则建立该账号的会话（养护员 → 工作台，管理员 → 管理页）
 * POST   /api/face/guest                  公开：以访客身份进入（只读）
 * GET    /api/face/profiles[?account_id=] 登录：本人的录入记录；管理员可看任一养护员账号
 * POST   /api/face/enroll                 登录：{account_id?, embeddings:[[…]×3–5], real, live, thumbnail?} 多帧取平均后保存
 * DELETE /api/face/profiles/{id}          登录：删除本人的；管理员可删除任一养护员的
 * GET    /api/face/accounts               管理员：养护员账号列表（含已录入条数）
 * </pre>
 * 录入必须先用账号密码（或已录入的人脸）登录，只能给自己录入；管理员可以给任一养护员录入 / 删除。访客 403，未登录 401。
 */
@WebServlet(name = "FaceServlet", value = "/api/face/*")
public class FaceServlet extends HttpServlet {
    private static final Pattern PROFILE = Pattern.compile("^/profiles/(\\d{1,18})/?$");
    private static final Pattern THUMB = Pattern.compile("^data:image/jpeg;base64,[A-Za-z0-9+/=]+$");
    private static final long WINDOW_MS = 5 * 60_000L;

    private final JdbcFaceStore faces = new JdbcFaceStore();
    private final JdbcAccountStore accounts = new JdbcAccountStore();
    /** 识别尝试限流：IP → 最近 5 分钟的尝试时间。 */
    private final Map<String, Deque<Long>> attempts = new ConcurrentHashMap<>();

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo() == null ? "/" : req.getPathInfo();
        String m = req.getMethod();
        try {
            if ("GET".equals(m) && "/status".equals(path)) { status(resp); return; }
            if ("POST".equals(m) && "/identify".equals(path)) { identify(req, resp); return; }
            if ("POST".equals(m) && "/guest".equals(path)) { guest(req, resp); return; }
            if ("GET".equals(m) && ("/profiles".equals(path) || "/profiles/".equals(path))) { profiles(req, resp); return; }
            if ("POST".equals(m) && "/enroll".equals(path)) { enroll(req, resp); return; }
            if ("GET".equals(m) && "/accounts".equals(path)) { accounts(req, resp); return; }
            Matcher pm = PROFILE.matcher(path);
            if ("DELETE".equals(m) && pm.matches()) { delete(req, resp, Long.parseLong(pm.group(1))); return; }
            ApiSupport.error(resp, 404, "not_found", "没有这个接口：" + m + " /api/face" + path);
        } catch (Jdbc.DbUnavailableException e) {
            ApiSupport.dbDown(this, resp, e);
        } catch (IllegalArgumentException e) {
            ApiSupport.error(resp, 400, "bad_request", e.getMessage());
        }
    }

    private void status(HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        int n = faces.countAll();
        ApiSupport.json(resp, 200, ApiSupport.obj("enrolled", n > 0, "db", true));
    }

    private boolean rateLimited(HttpServletRequest req) {
        long now = System.currentTimeMillis();
        Deque<Long> q = attempts.computeIfAbsent(req.getRemoteAddr(), k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) q.pollFirst();
            if (q.size() >= FaceConfig.maxAttemptsPer5Min()) return true;
            q.addLast(now);
        }
        if (attempts.size() > 10_000) attempts.clear();   // 简单防内存膨胀
        return false;
    }

    private static double num(Map<String, Object> in, String k, double def) {
        Object v = in.get(k);
        return v instanceof Number ? ((Number) v).doubleValue() : def;
    }

    /** 基础活体 / 防翻拍检查（分数由前端 human 模型给出，见 FaceConfig 说明）。不通过返回提示语。 */
    private static String livenessProblem(Map<String, Object> in) {
        double real = num(in, "real", -1), live = num(in, "live", -1);
        if (real < 0 || live < 0) return "缺少活体检测结果，请刷新页面后重试";
        if (real < FaceConfig.minReal()) return "未通过防翻拍检测（请不要使用照片 / 屏幕），请正对摄像头重试";
        if (live < FaceConfig.minLive()) return "未通过活体检测，请正对摄像头、保持光线充足后重试";
        return null;
    }

    private void identify(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        if (rateLimited(req)) { ApiSupport.error(resp, 429, "too_many_attempts", "识别尝试过于频繁，请 5 分钟后再试，或使用账号密码登录"); return; }
        String body = ApiSupport.body(req, 256 * 1024);
        if (body == null) { ApiSupport.error(resp, 413, "too_large", "请求过大"); return; }
        Map<String, Object> in = MiniJson.parseObject(body);
        float[] probe = FaceMatcher.toVector(in.get("embedding") instanceof List ? (List<?>) in.get("embedding") : null);
        if (probe == null) { ApiSupport.error(resp, 400, "bad_request", "人脸特征格式不正确"); return; }
        String live = livenessProblem(in);
        if (live != null) { ApiSupport.error(resp, 422, "liveness_failed", live); return; }
        List<FaceMatcher.Profile> all = faces.allVectors();
        if (all.isEmpty()) { ApiSupport.json(resp, 409, ApiSupport.obj("error", "no_faces", "message", "系统里还没有任何人脸录入，请先进行人脸录入")); return; }
        FaceMatcher.Match match = FaceMatcher.identify(probe, all, FaceConfig.threshold(), FaceConfig.margin());
        AdminUser user = match.matched() ? accounts.findActive(match.accountId) : null;
        if (user == null || !Roles.canEnrollFace(user.getRoleCode())) {
            log("人脸识别未通过：best=" + String.format("%.3f", match.best) + " second=" + String.format("%.3f", match.second) + " ip=" + req.getRemoteAddr());
            ApiSupport.json(resp, 401, ApiSupport.obj("ok", false, "error", "not_recognized",
                    "message", "未能识别您的身份。可以重试，或以访客身份进入、使用账号密码登录"));
            return;
        }
        Roles.signIn(req, user, "face");
        log("人脸登录成功：" + user.getUsername() + "（" + user.getRoleCode() + "）similarity=" + String.format("%.3f", match.best));
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "user", ApiSupport.userJson(user, false),
                "similarity", Math.round(match.best * 1000) / 1000.0,
                "redirect", req.getContextPath() + Roles.homeFor(user)));
    }

    private void guest(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Roles.enterAsVisitor(req);
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "user", ApiSupport.userJson(null, true),
                "redirect", req.getContextPath() + "/ecohome.jsp"));
    }

    /** 可操作的目标账号：本人；或管理员操作养护员账号。不允许返回 null 并写好 403。 */
    private Map<String, Object> targetAccount(HttpServletRequest req, HttpServletResponse resp, AdminUser me, Integer accountId)
            throws IOException, Jdbc.DbUnavailableException {
        int target = accountId == null ? me.getId() : accountId;
        Map<String, Object> acc = accounts.accountInfo(target);
        if (acc == null) { ApiSupport.error(resp, 404, "not_found", "账号不存在"); return null; }
        if (target == me.getId()) return acc;
        if (Roles.isAdmin(me.getRoleCode()) && Roles.isMaintainer((String) acc.get("role_code"))) return acc;
        ApiSupport.error(resp, 403, "forbidden", Roles.isAdmin(me.getRoleCode())
                ? "管理员只能为养护员账号录入 / 删除人脸，其他管理员请本人登录后录入" : "只能为自己的账号录入 / 管理人脸");
        return null;
    }

    private static Integer intParam(String s) {
        if (s == null || s.trim().isEmpty()) return null;
        try { return Integer.valueOf(s.trim()); } catch (NumberFormatException e) { throw new IllegalArgumentException("account_id 应为整数"); }
    }

    private void profiles(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.FACE_ROLES, "人脸管理");
        if (me == null) return;
        Map<String, Object> acc = targetAccount(req, resp, me, intParam(req.getParameter("account_id")));
        if (acc == null) return;
        ApiSupport.json(resp, 200, ApiSupport.obj("account", acc, "items", faces.listByAccount((Integer) acc.get("id")),
                "max", FaceConfig.maxProfilesPerAccount()));
    }

    private void accounts(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.ADMIN_ROLES, "养护员人脸管理");
        if (me == null) return;
        ApiSupport.json(resp, 200, ApiSupport.obj("items", accounts.maintainerAccounts()));
    }

    @SuppressWarnings("unchecked")
    private void enroll(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.FACE_ROLES, "人脸录入");
        if (me == null) return;
        String body = ApiSupport.body(req, 512 * 1024);
        if (body == null) { ApiSupport.error(resp, 413, "too_large", "请求过大"); return; }
        Map<String, Object> in = MiniJson.parseObject(body);
        Object aid = in.get("account_id");
        Integer accountId = aid instanceof Number ? Integer.valueOf(((Number) aid).intValue()) : null;
        Map<String, Object> acc = targetAccount(req, resp, me, accountId);
        if (acc == null) return;
        int target = (Integer) acc.get("id");
        if (!Roles.canEnrollFace((String) acc.get("role_code"))) { ApiSupport.error(resp, 403, "forbidden", "该账号角色不需要录入人脸"); return; }

        Object raw = in.get("embeddings");
        if (!(raw instanceof List) || ((List<?>) raw).size() < 3 || ((List<?>) raw).size() > 5) {
            ApiSupport.error(resp, 400, "bad_request", "需要 3–5 帧不同角度的人脸特征"); return;
        }
        List<float[]> frames = new ArrayList<>();
        for (Object o : (List<Object>) raw) {
            float[] v = FaceMatcher.toVector(o instanceof List ? (List<?>) o : null);
            if (v == null) { ApiSupport.error(resp, 400, "bad_request", "人脸特征格式不正确"); return; }
            frames.add(v);
        }
        float[] mean;
        try { mean = FaceMatcher.average(frames); } catch (IllegalArgumentException e) { ApiSupport.error(resp, 400, "bad_request", e.getMessage()); return; }
        if (FaceMatcher.minPairwise(frames) < FaceConfig.minFrameConsistency()) {
            ApiSupport.error(resp, 422, "inconsistent_frames", "采集到的几帧不像同一个人（画面里可能有别人），请单独正对摄像头重新录入"); return;
        }
        String live = livenessProblem(in);
        if (live != null) { ApiSupport.error(resp, 422, "liveness_failed", live); return; }
        Object th = in.get("thumbnail");
        String thumb = th instanceof String && !((String) th).isEmpty() ? (String) th : null;
        if (thumb != null && (thumb.length() > 40_000 || !THUMB.matcher(thumb).matches())) {
            ApiSupport.error(resp, 400, "bad_request", "缩略图格式不正确（需为 40KB 以内的 JPEG data URL）"); return;
        }
        if (faces.countByAccount(target) >= FaceConfig.maxProfilesPerAccount()) {
            ApiSupport.error(resp, 409, "too_many", "该账号已录入 " + FaceConfig.maxProfilesPerAccount() + " 条人脸，请先删除旧的再录入"); return;
        }
        // 防止同一张脸录到两个账号：与其他账号的已录入人脸过于相似时拒绝
        List<FaceMatcher.Profile> others = new ArrayList<>();
        for (FaceMatcher.Profile p : faces.allVectors()) if (p.accountId != target) others.add(p);
        FaceMatcher.Match near = FaceMatcher.closest(mean, others);
        if (near.accountId > 0 && near.best >= FaceConfig.threshold()) {
            ApiSupport.error(resp, 409, "duplicate_face", "这张脸与系统里另一个账号已录入的人脸过于相似，不能重复录入到不同账号"); return;
        }
        long id = faces.insert(target, (String) acc.get("role_code"), mean, frames.size(), thumb, ApiSupport.displayName(me));
        log("人脸录入：账号 " + acc.get("username") + "，操作人 " + me.getUsername() + "，帧数 " + frames.size());
        ApiSupport.json(resp, 201, ApiSupport.obj("ok", true, "id", id, "account", acc, "frames", frames.size(),
                "items", faces.listByAccount(target)));
    }

    private void delete(HttpServletRequest req, HttpServletResponse resp, long id) throws IOException, Jdbc.DbUnavailableException {
        AdminUser me = ApiSupport.require(req, resp, Roles.FACE_ROLES, "人脸管理");
        if (me == null) return;
        Integer owner = faces.ownerOf(id);
        if (owner == null) { ApiSupport.error(resp, 404, "not_found", "人脸记录不存在"); return; }
        Map<String, Object> acc = targetAccount(req, resp, me, owner);
        if (acc == null) return;
        faces.delete(id);
        log("删除人脸：#" + id + "（账号 " + acc.get("username") + "），操作人 " + me.getUsername());
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "items", faces.listByAccount(owner)));
    }
}
