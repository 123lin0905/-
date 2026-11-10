-- MySQL dump 10.13  Distrib 8.0.13, for Win64 (x86_64)
--
-- Host: localhost    Database: plant
-- ------------------------------------------------------
-- Server version	8.0.13

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
 SET NAMES utf8mb4 ;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `maintainer`
--

DROP TABLE IF EXISTS `maintainer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `maintainer` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `staff_no` varchar(50) NOT NULL,
  `name` varchar(50) NOT NULL,
  `gender` varchar(10) DEFAULT '男',
  `phone` varchar(50) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `duty` varchar(100) DEFAULT NULL,
  `status` varchar(20) DEFAULT '在岗',
  `entry_date` varchar(50) DEFAULT NULL,
  `remark` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_no` (`staff_no`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintainer`
--

LOCK TABLES `maintainer` WRITE;
/*!40000 ALTER TABLE `maintainer` DISABLE KEYS */;
INSERT INTO `maintainer` VALUES (1,'WH-1001','张师傅','男','13800138001','户外乔木班','高级园艺师','在岗','2023-05-10','擅长乔木高枝修剪、大型树冠造型与抗风防倒加固'),(2,'WH-1002','李工','女','13912345678','室内绿化组','花卉养护专家','在岗','2024-02-18','精通微孔水培、阴生观叶植物光照温湿度科学调控'),(3,'WH-1003','王专员','男','13766668888','综合养护组','水肥一体化技术员','在岗','2024-06-01','负责园区自动喷滴灌管网维护与有机营养液配比巡检'),(4,'WH-1004','赵师傅','男','13699887766','植保防治组','病虫害防治技师','轮休','2022-11-20','负责天府苗圃生态防虫治病、生物药剂定期防治');
/*!40000 ALTER TABLE `maintainer` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plant`
--

DROP TABLE IF EXISTS `plant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `plant` (
  `pid` char(32) NOT NULL,
  `pname` varchar(50) NOT NULL,
  `ptype` varchar(50) NOT NULL,
  `pdatetime` datetime NOT NULL,
  `pprice` int(11) NOT NULL,
  `ppic` varchar(100) DEFAULT NULL,
  `pdesc` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`pid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plant`
--

LOCK TABLES `plant` WRITE;
/*!40000 ALTER TABLE `plant` DISABLE KEYS */;
INSERT INTO `plant` VALUES ('915024a2e2fc4368afe854f445d2018d','天府第一银杏','银杏','2026-09-07 00:00:00',28000,'https://cdn.pixabay.com/photo/2020/05/21/15/39/ginkgo-5201388_1280.jpg','银杏（Ginkgo biloba L.），又名白果、公孙树，是裸子植物银杏纲唯一的树种。它为高大落叶乔木，可高达40米，胸径达4米。银杏的叶片扇形、长柄、淡绿，具有叉状并列细脉。银杏雌雄异株，球花风媒传粉，种子为椭圆形，外皮肉质，成熟时呈黄色或橙色。银杏是中生代遗留的珍稀树.'),('99ffdc08326e4389b0eeae0813a6e24d','天府第二银杏','银杏','2026-09-25 00:00:00',1200,'https://pic.nximg.cn/file/20250613/34286964_110736752102_2.jpg','银杏（Ginkgo biloba L.），又名白果、公孙树，是裸子植物银杏纲唯一的树种。它为高大落叶乔木，可高达40米，胸径达4米。银杏的叶片扇形、长柄、淡绿，具有叉状并列细脉。银杏雌雄异株，球花风媒传粉，种子为椭圆形，外皮肉质，成熟时呈黄色或橙色。银杏是中生代遗留的珍稀树.'),('d7b283e28f4f46a685133437f0cac025','天府第三银杏','银杏','2026-09-07 00:00:00',28000,'https://pic.nximg.cn/file/20231127/3768769_110530865100_2.jpg','银杏（Ginkgo biloba L.），为银杏科、银杏属落叶乔木。');
/*!40000 ALTER TABLE `plant` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plant_maintenance`
--

DROP TABLE IF EXISTS `plant_maintenance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `plant_maintenance` (
  `mid` int(11) NOT NULL AUTO_INCREMENT,
  `pid` varchar(64) NOT NULL,
  `pname` varchar(100) DEFAULT NULL,
  `mtype` varchar(50) NOT NULL,
  `mdate` varchar(50) NOT NULL,
  `operator` varchar(50) NOT NULL,
  `health_status` varchar(50) DEFAULT '良好',
  `notes` text,
  PRIMARY KEY (`mid`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plant_maintenance`
--

LOCK TABLES `plant_maintenance` WRITE;
/*!40000 ALTER TABLE `plant_maintenance` DISABLE KEYS */;
INSERT INTO `plant_maintenance` VALUES (7,'915024a2e2fc4368afe854f445d2018d','天府第一银杏','修剪整形','2026-09-28 10:07','养护专员','状态良好','快捷一键完成修剪整形打卡'),(8,'99ffdc08326e4389b0eeae0813a6e24d','天府第二银杏','施肥补充','2026-09-28 10:07','养护专员','状态良好','快捷一键完成施肥补充打卡');
/*!40000 ALTER TABLE `plant_maintenance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `type`
--

DROP TABLE IF EXISTS `type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `type` (
  `tid` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tname` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tdesc` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`tid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `type`
--

LOCK TABLES `type` WRITE;
/*!40000 ALTER TABLE `type` DISABLE KEYS */;
INSERT INTO `type` VALUES ('1','乔木','树体高大具有明显主干'),('2','灌木','主干不明显多分枝木本植物'),('3','观叶植物','以观赏叶片形态和色彩为主'),('4','多肉植物','肉质多汁具有贮水功能'),('5','花卉盆栽','以观花为主的草本或木本'),('6','水培植物','适宜水培室内洁净观赏'),('7','银杏','银杏科银杏属落叶乔木');
/*!40000 ALTER TABLE `type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'plant'
--

--
-- Dumping routines for database 'plant'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-28 11:32:29
