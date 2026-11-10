package org.example.demo1;

public class PlantType {
    private int tid;
    private String tname;
    private String tdesc;

    public PlantType() {
    }

    public PlantType(int tid, String tname, String tdesc) {
        this.tid = tid;
        this.tname = tname;
        this.tdesc = tdesc;
    }

    public int getTid() {
        return tid;
    }

    public void setTid(int tid) {
        this.tid = tid;
    }

    public String getTname() {
        return tname;
    }

    public void setTname(String tname) {
        this.tname = tname;
    }

    public String getTdesc() {
        return tdesc;
    }

    public void setTdesc(String tdesc) {
        this.tdesc = tdesc;
    }
}
