import org.junit.jupiter.api.Test;
import security.FaceMatcher;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

/** 服务端人脸比对：余弦相似度、多帧平均、阈值 + 领先差值、输入校验、存储编码。 */
class FaceMatcherTest {
    private static float[] vec(long seed, int dim) {
        Random r = new Random(seed);
        float[] v = new float[dim];
        for (int i = 0; i < dim; i++) v[i] = (float) Math.max(0, r.nextGaussian());   // faceres 特征非负
        return v;
    }

    /** 在 base 上加噪声，模拟同一个人的另一帧。 */
    private static float[] jitter(float[] base, long seed, double amount) {
        Random r = new Random(seed);
        float[] v = new float[base.length];
        for (int i = 0; i < v.length; i++) v[i] = (float) Math.max(0, base[i] + r.nextGaussian() * amount);
        return v;
    }

    @Test
    void cosineBasics() {
        float[] a = {1, 0, 0}, b = {0, 1, 0}, c = {2, 0, 0};
        assertEquals(0, FaceMatcher.cosine(a, b), 1e-9);
        assertEquals(1, FaceMatcher.cosine(a, c), 1e-9);
        assertEquals(-1, FaceMatcher.cosine(a, new float[]{1, 0}), 1e-9, "维度不同不可比");
        assertEquals(-1, FaceMatcher.cosine(a, new float[]{0, 0, 0}), 1e-9, "零向量不可比");
    }

    @Test
    void averageIsNormalizedAndCloserToEachFrame() {
        float[] base = vec(1, 1024);
        List<float[]> frames = Arrays.asList(jitter(base, 2, 0.4), jitter(base, 3, 0.4), jitter(base, 4, 0.4));
        float[] mean = FaceMatcher.average(frames);
        double norm = 0;
        for (float f : mean) norm += f * f;
        assertEquals(1, Math.sqrt(norm), 1e-4);
        assertTrue(FaceMatcher.cosine(mean, base) > FaceMatcher.cosine(frames.get(0), base), "平均后更接近本人");
        assertTrue(FaceMatcher.minConsistency(frames, mean) > 0.8);
        assertTrue(FaceMatcher.minPairwise(frames) > 0.6, "同一人的几帧两两相似");
        assertTrue(FaceMatcher.minPairwise(Arrays.asList(frames.get(0), frames.get(1), vec(99, 1024))) < 0.5, "混进别人时两两相似度低");
        assertThrows(IllegalArgumentException.class, () -> FaceMatcher.average(Arrays.asList(new float[4], new float[5])));
    }

    @Test
    void identifyPicksRightAccountAndRejectsStranger() {
        float[] alice = vec(10, 1024), bob = vec(20, 1024), stranger = vec(30, 1024);
        List<FaceMatcher.Profile> db = new ArrayList<>();
        db.add(new FaceMatcher.Profile(1, 101, FaceMatcher.average(Arrays.asList(jitter(alice, 11, .3), jitter(alice, 12, .3), jitter(alice, 13, .3)))));
        db.add(new FaceMatcher.Profile(2, 102, FaceMatcher.average(Arrays.asList(jitter(bob, 21, .3), jitter(bob, 22, .3), jitter(bob, 23, .3)))));
        db.add(new FaceMatcher.Profile(3, 102, FaceMatcher.average(Arrays.asList(jitter(bob, 24, .3), jitter(bob, 25, .3), jitter(bob, 26, .3)))));

        FaceMatcher.Match a = FaceMatcher.identify(jitter(alice, 14, .3), db, 0.6, 0.04);
        assertTrue(a.matched());
        assertEquals(101, a.accountId);
        assertEquals(1, a.profileId);
        FaceMatcher.Match b = FaceMatcher.identify(jitter(bob, 27, .3), db, 0.6, 0.04);
        assertEquals(102, b.accountId);
        FaceMatcher.Match s = FaceMatcher.identify(stranger, db, 0.6, 0.04);
        assertFalse(s.matched(), "陌生人不应被识别，best=" + s.best);
        assertTrue(s.best < 0.6);
    }

    @Test
    void marginRejectsAmbiguousMatch() {
        float[] v = vec(40, 256);
        List<FaceMatcher.Profile> db = Arrays.asList(new FaceMatcher.Profile(1, 1, v), new FaceMatcher.Profile(2, 2, jitter(v, 41, 0.01)));
        FaceMatcher.Match m = FaceMatcher.identify(v, db, 0.6, 0.04);
        assertFalse(m.matched(), "两个账号都几乎一样像时不能随便选一个");
        assertTrue(FaceMatcher.identify(v, db, 0.6, 0).matched());
        assertTrue(FaceMatcher.closest(v, db).accountId > 0);
    }

    @Test
    void thresholdBoundary() {
        float[] a = {1, 0}, b = {0.6f, 0.8f};          // 余弦 = 0.6
        List<FaceMatcher.Profile> db = Arrays.asList(new FaceMatcher.Profile(1, 7, b));
        assertTrue(FaceMatcher.identify(a, db, 0.6 - 1e-6, 0).matched());
        assertFalse(FaceMatcher.identify(a, db, 0.61, 0).matched());
        assertFalse(FaceMatcher.identify(a, new ArrayList<>(), 0.6, 0).matched());
    }

    @Test
    void toVectorValidatesInput() {
        List<Object> ok = new ArrayList<>();
        for (int i = 0; i < 128; i++) ok.add((double) i / 128);
        assertNotNull(FaceMatcher.toVector(ok));
        assertNull(FaceMatcher.toVector(ok.subList(0, 10)), "维度太小");
        List<Object> bad = new ArrayList<>(ok);
        bad.set(3, "x");
        assertNull(FaceMatcher.toVector(bad));
        bad.set(3, Double.NaN);
        assertNull(FaceMatcher.toVector(bad));
        List<Object> zeros = new ArrayList<>();
        for (int i = 0; i < 128; i++) zeros.add(0.0);
        assertNull(FaceMatcher.toVector(zeros), "全零");
        assertNull(FaceMatcher.toVector(null));
    }

    @Test
    void bytesRoundTrip() {
        float[] v = vec(50, 1024);
        assertArrayEquals(v, FaceMatcher.fromBytes(FaceMatcher.toBytes(v)));
    }
}
