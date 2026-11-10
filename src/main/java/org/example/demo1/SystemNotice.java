package org.example.demo1;

public class SystemNotice {
    private int id;
    private String title;
    private String content;
    private String category;
    private String publisher;
    private String priority;
    private String publishDate;
    private String status;

    public SystemNotice() {
    }

    public SystemNotice(int id, String title, String content, String category, String publisher, String priority, String publishDate, String status) {
        this.id = id;
        this.title = title;
        this.content = content;
        this.category = category;
        this.publisher = publisher;
        this.priority = priority;
        this.publishDate = publishDate;
        this.status = status;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getPublisher() {
        return publisher;
    }

    public void setPublisher(String publisher) {
        this.publisher = publisher;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getPublishDate() {
        return publishDate;
    }

    public void setPublishDate(String publishDate) {
        this.publishDate = publishDate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
