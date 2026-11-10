package org.example.demo1.mapper;

public interface SchemaMapper {
    void createPlantTable();
    void createTypeTable();
    void createMaintenanceTable();
    void createMaintainerTable();
    void createAreaTable();
    void createMaintainerPlantTable();
    void createAdminUserTable();
    void createNoticeTable();
    void createAnimalTable();

    void addColumnAreaId();
    void addColumnLatitude();
    void addColumnLongitude();
    void addColumnAnimalLatitude();
    void addColumnAnimalLongitude();
    void updateSampleAnimalCoordinates();
    void addColumnTrimPeriodDays();
    void addColumnFertilizePeriodDays();
    void addColumnWaterPeriodDays();
    void addColumnPestPeriodDays();
    void addColumnNextTrimDate();
    void addColumnNextFertilizeDate();
    void addColumnNextWaterDate();
    void addColumnNextPestDate();

    int countTypes();
    int countMaintainers();
    int countAdminUsers();
    int countNotices();
    int countAnimals();

    void insertDefaultType(String tid, String tname, String tdesc);
    void insertSampleMaintainers();
    void insertDefaultAdmin(String username, String passwordHash, String displayName, String roleCode);
    void insertSampleNotices();
    void insertSampleAnimals();
    void cleanMockMaintenance();
}
