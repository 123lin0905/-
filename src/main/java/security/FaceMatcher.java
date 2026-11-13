package security;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * 服务端人脸特征比对（纯计算，便于单元测试）。
 * <ul>
 *   <li>特征向量来自前端 @vladmandic/human 的 faceres 模型（1024 维、非负）；只上传到服务端，从不下发到前端；</li>
 *   <li>录入：3–5 帧各自 L2 归一化后取平均，再归一化，作为一条 face_profile；</li>
 *   <li>识别：与每条 face_profile 算余弦相似度，按账号取最高分；最高分 ≥ 阈值，且领先第二名账号 ≥ margin 才算识别成功。</li>
 * </ul>
 * faceres 特征非负，不同人的余弦相似度通常也有 0.25–0.5（用 human 自带样例实测），同一人不同照片约 0.5–0.9，
 * 所以默认阈值取 0.60（可用 -Dface.threshold 调整，见 {@link FaceConfig}）。
 */
public final class FaceMatcher {
    private FaceMatcher() {
    }

    public static final int MIN_DIM = 64, MAX_DIM = 2048;

    /** 一条已录入的特征（不含缩略图）。 */
    public static final class Profile {
        public final long id;
        public final int accountId;
        public final float[] vector;

        public Profile(long id, int accountId, float[] vector) {
            this.id = id;
            this.accountId = accountId;
            this.vector = vector;
        }
    }

    public static final class Match {
        /** 最佳账号；未达阈值 / 领先不足时为 -1。 */
        public final int accountId;
        public final double best, second;
        public final long profileId;

        Match(int accountId, double best, double second, long profileId) {
            this.accountId = accountId;
            this.best = best;
            this.second = second;
            this.profileId = profileId;
        }

        public boolean matched() { return accountId > 0; }
    }

    /** 校验并转换前端上传的数组：维度 64–2048、全部为有限数、非全零。不合格返回 null。 */
    public static float[] toVector(List<?> raw) {
        if (raw == null || raw.size() < MIN_DIM || raw.size() > MAX_DIM) return null;
        float[] v = new float[raw.size()];
        double norm = 0;
        for (int i = 0; i < v.length; i++) {
            Object o = raw.get(i);
            if (!(o instanceof Number)) return null;
            double d = ((Number) o).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d) || Math.abs(d) > 1e4) return null;
            v[i] = (float) d;
            norm += d * d;
        }
        return norm > 1e-12 ? v : null;
    }

    public static float[] normalize(float[] v) {
        double n = 0;
        for (float f : v) n += (double) f * f;
        n = Math.sqrt(n);
        float[] out = new float[v.length];
        if (n < 1e-12) return out;
        for (int i = 0; i < v.length; i++) out[i] = (float) (v[i] / n);
        return out;
    }

    /** 余弦相似度；维度不同返回 -1（不同模型的特征不可比）。 */
    public static double cosine(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length) return -1;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += (double) a[i] * b[i];
            na += (double) a[i] * a[i];
            nb += (double) b[i] * b[i];
        }
        if (na < 1e-12 || nb < 1e-12) return -1;
        return dot / Math.sqrt(na * nb);
    }

    /** 多帧取平均：每帧先归一化，平均后再归一化。维度不一致抛 IllegalArgumentException。 */
    public static float[] average(Collection<float[]> frames) {
        if (frames == null || frames.isEmpty()) throw new IllegalArgumentException("没有可用的帧");
        int dim = -1;
        double[] acc = null;
        for (float[] f : frames) {
            if (dim < 0) { dim = f.length; acc = new double[dim]; }
            if (f.length != dim) throw new IllegalArgumentException("各帧特征维度不一致");
            float[] n = normalize(f);
            for (int i = 0; i < dim; i++) acc[i] += n[i];
        }
        float[] out = new float[dim];
        for (int i = 0; i < dim; i++) out[i] = (float) (acc[i] / frames.size());
        return normalize(out);
    }

    /**
     * 多帧两两之间的最低相似度：用来拒绝“多帧里混进了另一个人”。
     * 同一次录入、同一摄像头的几帧通常 ≥ 0.7；不同人通常 ≤ 0.5（faceres 特征非负，见类说明）。
     */
    public static double minPairwise(List<float[]> frames) {
        double min = 1;
        for (int i = 0; i < frames.size(); i++)
            for (int j = i + 1; j < frames.size(); j++) min = Math.min(min, cosine(frames.get(i), frames.get(j)));
        return min;
    }

    /** 每帧与平均特征的最低相似度。 */
    public static double minConsistency(Collection<float[]> frames, float[] mean) {
        double min = 1;
        for (float[] f : frames) min = Math.min(min, cosine(f, mean));
        return min;
    }

    /** 1:N 比对：按账号取最高分，最高分 ≥ threshold 且领先第二名账号 ≥ margin 才算命中。 */
    public static Match identify(float[] probe, Collection<Profile> profiles, double threshold, double margin) {
        int bestAcc = -1;
        long bestProfile = -1;
        double best = -1, second = -1;
        java.util.Map<Integer, Double> perAccount = new java.util.HashMap<>();
        java.util.Map<Integer, Long> perAccountProfile = new java.util.HashMap<>();
        for (Profile p : profiles) {
            double s = cosine(probe, p.vector);
            Double old = perAccount.get(p.accountId);
            if (old == null || s > old) { perAccount.put(p.accountId, s); perAccountProfile.put(p.accountId, p.id); }
        }
        for (java.util.Map.Entry<Integer, Double> e : perAccount.entrySet()) {
            double s = e.getValue();
            if (s > best) { second = best; best = s; bestAcc = e.getKey(); bestProfile = perAccountProfile.get(e.getKey()); }
            else if (s > second) second = s;
        }
        boolean ok = bestAcc > 0 && best >= threshold && (second < 0 || best - second >= margin);
        return new Match(ok ? bestAcc : -1, best, second, ok ? bestProfile : -1);
    }

    /** 最佳匹配账号（不看阈值），给“这张脸是否已录入到别的账号”检查用。 */
    public static Match closest(float[] probe, Collection<Profile> profiles) {
        return identify(probe, profiles, -2, -2);
    }

    public static byte[] toBytes(float[] v) {
        ByteBuffer b = ByteBuffer.allocate(v.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float f : v) b.putFloat(f);
        return b.array();
    }

    public static float[] fromBytes(byte[] bytes) {
        ByteBuffer b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        float[] v = new float[bytes.length / 4];
        for (int i = 0; i < v.length; i++) v[i] = b.getFloat();
        return v;
    }

    public static List<float[]> listOf(float[]... vs) {
        List<float[]> l = new ArrayList<>();
        for (float[] v : vs) l.add(v);
        return l;
    }
}
