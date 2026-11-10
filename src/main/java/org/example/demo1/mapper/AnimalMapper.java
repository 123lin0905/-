package org.example.demo1.mapper;

import org.apache.ibatis.annotations.Param;
import org.example.demo1.Animal;

import java.util.List;

public interface AnimalMapper {

    int insertAnimal(Animal animal);

    List<Animal> selectAllAnimals(@Param("keyword") String keyword, @Param("category") String category);

    Animal selectAnimalById(@Param("id") int id);

    Animal selectAnimalByNo(@Param("animalNo") String animalNo);

    int updateAnimal(Animal animal);

    int updateAnimalLocation(@Param("id") int id,
                             @Param("latitude") Double latitude,
                             @Param("longitude") Double longitude,
                             @Param("areaId") Integer areaId);

    int updateFeedingDate(@Param("id") int id, @Param("nextFeedingDate") String nextFeedingDate);

    int deleteAnimal(@Param("id") int id);

    int countAnimals();

    Integer sumAnimalCount();

    int countDueFeedingAnimals(@Param("today") String today);
}
