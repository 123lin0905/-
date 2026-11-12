package DB;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 极简 JSON 解析 / 输出（项目未引入 Jackson/Gson，三维生态接口只需要扁平对象和数组）。
 * 解析结果：对象 → LinkedHashMap，数组 → ArrayList，字符串 → String，数字 → Double，true/false → Boolean，null → null。
 */
public final class MiniJson {
    private final String s;
    private int i;

    private MiniJson(String s) { this.s = s; }

    public static Object parse(String text) {
        if (text == null) throw new IllegalArgumentException("空 JSON");
        MiniJson p = new MiniJson(text);
        p.ws();
        Object v = p.value();
        p.ws();
        if (p.i != p.s.length()) throw p.err("多余的字符");
        return v;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String text) {
        Object v = parse(text);
        if (!(v instanceof Map)) throw new IllegalArgumentException("需要 JSON 对象");
        return (Map<String, Object>) v;
    }

    private IllegalArgumentException err(String m) { return new IllegalArgumentException("JSON 格式错误（位置 " + i + "）：" + m); }

    private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

    private Object value() {
        if (i >= s.length()) throw err("意外结束");
        char c = s.charAt(i);
        if (c == '{') return object();
        if (c == '[') return array();
        if (c == '"') return string();
        if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
        if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
        if (s.startsWith("null", i)) { i += 4; return null; }
        return number();
    }

    private Map<String, Object> object() {
        Map<String, Object> m = new LinkedHashMap<>();
        i++; ws();
        if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
        while (true) {
            ws();
            if (i >= s.length() || s.charAt(i) != '"') throw err("需要键名");
            String k = string(); ws();
            if (i >= s.length() || s.charAt(i) != ':') throw err("需要冒号");
            i++; ws();
            m.put(k, value()); ws();
            if (i >= s.length()) throw err("对象未结束");
            char c = s.charAt(i++);
            if (c == '}') return m;
            if (c != ',') throw err("需要逗号");
        }
    }

    private List<Object> array() {
        List<Object> a = new ArrayList<>();
        i++; ws();
        if (i < s.length() && s.charAt(i) == ']') { i++; return a; }
        while (true) {
            ws(); a.add(value()); ws();
            if (i >= s.length()) throw err("数组未结束");
            char c = s.charAt(i++);
            if (c == ']') return a;
            if (c != ',') throw err("需要逗号");
        }
    }

    private String string() {
        StringBuilder b = new StringBuilder();
        i++;
        while (i < s.length()) {
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c == '\\') {
                if (i >= s.length()) break;
                char e = s.charAt(i++);
                switch (e) {
                    case 'n': b.append('\n'); break;
                    case 't': b.append('\t'); break;
                    case 'r': b.append('\r'); break;
                    case 'b': b.append('\b'); break;
                    case 'f': b.append('\f'); break;
                    case 'u':
                        if (i + 4 > s.length()) throw err("\\u 转义不完整");
                        b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                    default: b.append(e);
                }
            } else b.append(c);
        }
        throw err("字符串未结束");
    }

    private Double number() {
        int st = i;
        while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        if (st == i) throw err("无法识别的值");
        try { return Double.valueOf(s.substring(st, i)); } catch (NumberFormatException e) { throw err("数字格式错误"); }
    }

    // ---------------------------------------------------------------- 输出
    public static String stringify(Object v) {
        StringBuilder b = new StringBuilder();
        write(b, v);
        return b.toString();
    }

    @SuppressWarnings("unchecked")
    private static void write(StringBuilder b, Object v) {
        if (v == null) b.append("null");
        else if (v instanceof String) quote(b, (String) v);
        else if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) b.append("null");
            else if (d == Math.rint(d) && Math.abs(d) < 1e15) b.append((long) d);
            else b.append(d);
        } else if (v instanceof Number || v instanceof Boolean) b.append(v);
        else if (v instanceof Map) {
            b.append('{');
            Iterator<Map.Entry<String, Object>> it = ((Map<String, Object>) v).entrySet().iterator();
            while (it.hasNext()) { Map.Entry<String, Object> e = it.next(); quote(b, e.getKey()); b.append(':'); write(b, e.getValue()); if (it.hasNext()) b.append(','); }
            b.append('}');
        } else if (v instanceof Iterable) {
            b.append('[');
            Iterator<Object> it = ((Iterable<Object>) v).iterator();
            while (it.hasNext()) { write(b, it.next()); if (it.hasNext()) b.append(','); }
            b.append(']');
        } else quote(b, String.valueOf(v));
    }

    private static void quote(StringBuilder b, String s) {
        b.append('"');
        for (int k = 0; k < s.length(); k++) {
            char c = s.charAt(k);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '<': b.append("\\u003c"); break;   // 防止嵌入 HTML 时提前闭合 </script>
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        b.append('"');
    }
}
