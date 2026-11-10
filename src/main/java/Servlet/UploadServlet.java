package Servlet;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.file.Paths;
import java.util.UUID;

@WebServlet(name = "UploadServlet", value = "/UploadServlet")
@MultipartConfig(
        fileSizeThreshold = 1024 * 1024 * 2, // 2MB
        maxFileSize = 1024 * 1024 * 20,      // 20MB
        maxRequestSize = 1024 * 1024 * 50    // 50MB
)
public class UploadServlet extends HttpServlet {
    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        request.setCharacterEncoding("UTF-8");
        response.setContentType("application/json;charset=UTF-8");
        PrintWriter out = response.getWriter();

        try {
            Part filePart = request.getPart("file");
            if (filePart == null || filePart.getSize() == 0) {
                out.print("{\"success\":false,\"message\":\"未选择任何文件\"}");
                return;
            }

            String submittedFileName = Paths.get(filePart.getSubmittedFileName()).getFileName().toString();
            String fileExt = "";
            int dotIndex = submittedFileName.lastIndexOf(".");
            if (dotIndex > 0) {
                fileExt = submittedFileName.substring(dotIndex);
            }

            String newFileName = System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8) + fileExt;

            // 获取服务器上的 uploads 目录
            String uploadPath = request.getServletContext().getRealPath("/uploads");
            File uploadDir = new File(uploadPath);
            if (!uploadDir.exists()) {
                uploadDir.mkdirs();
            }

            String saveFilePath = uploadPath + File.separator + newFileName;
            filePart.write(saveFilePath);

            // 返回相对路径供前端保存到数据库与渲染
            String relativeUrl = "uploads/" + newFileName;
            out.print("{\"success\":true,\"url\":\"" + relativeUrl + "\",\"fileName\":\"" + newFileName + "\"}");
        } catch (Exception e) {
            e.printStackTrace();
            out.print("{\"success\":false,\"message\":\"上传失败：" + e.getMessage() + "\"}");
        }
    }
}
